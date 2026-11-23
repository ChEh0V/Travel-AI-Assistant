"""Evaluate the frozen snapshot, never the refreshed SQLite database."""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from server import HERE,snapshot,generate
from search import Index

BENCH = HERE.parent/"benchmark"
def run(llm=False):
    cases=json.loads((BENCH/"paris.json").read_text(encoding="utf-8"))
    documents=snapshot()
    index=Index(documents)
    digest=hashlib.sha256(json.dumps(documents,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    report={"snapshot_sha256":digest,"k":5,"mode":os.environ["RAG_MODEL"] if llm else "extractive","runs":[]}
    for rewrite,expand in ([(True,True)] if llm else [(False,False),(True,False),(True,True)]):
        rows=[]
        for case in cases:
            messages=[dict(role="user",content=s) for s in case["messages"]]
            result=index.ask(messages,rewrite=rewrite,expand=expand,now=datetime(2026,11,23,tzinfo=timezone.utc))
            if llm:
                result=generate(result,messages[-1]["content"])
            ids=set(case["relevant"])
            hits=result["hits"]
            row=dict(id=case["id"],hits=hits,mode=result.get("mode","extractive"),answer=result["reply"],sources=[s["id"] for s in result["sources"]])
            if ids:
                row["recall"]=len(ids.intersection(hits))/len(ids)
                row["rr"]=next((1/r for r,key in enumerate(hits,1) if key in ids),0)
                row["correct"]=set(row["sources"])==ids and all(t in result["reply"] for t in case["expected"])
            else:
                row["rejected"]=result["status"]=="insufficient" and not row["sources"]
            rows.append(row)
        def mean(key):
            values=[r[key] for r in rows if key in r]
            return round(sum(values)/len(values),4)
        report["runs"].append(dict(rewrite=rewrite,expand=expand,recall=mean("recall"),mrr=mean("rr"),
                                   accuracy=mean("correct"),correct_rejection_rate=mean("rejected"),cases=rows))
    return report
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",type=Path)
    parser.add_argument("--llm",action="store_true")
    args=parser.parse_args()
    if args.llm and not os.getenv("RAG_MODEL"):
        parser.error("--llm requires RAG_MODEL")
    report=run(args.llm)
    if args.out:
        args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for row in report["runs"]:
        print({k:v for k,v in row.items() if k!="cases"})

