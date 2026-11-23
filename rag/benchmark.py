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
def run(llm=False,course=False):
    documents=snapshot()
    if course:
        cases=json.loads((BENCH/"course.json").read_text(encoding="utf-8"))
        ids={key for case in cases for key in case["relevant"]}
        documents=[d for d in documents if d["id"] in ids]
    else:
        cases=[]
        for name in ("paris.json","europe.json"):
            cases.extend(json.loads((BENCH/name).read_text(encoding="utf-8")))
    index=Index(documents)
    digest=hashlib.sha256(json.dumps(documents,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    report={"snapshot_sha256":digest,"k":5,"mode":os.environ["RAG_MODEL"] if llm else "extractive","runs":[]}
    # Evaluate the index itself before application filters, rewriting or generation.
    raw=[]
    covered=set()
    for case in cases:
        relevant=set(case["relevant"])
        if not relevant:
            continue
        if len(relevant)<3 or not relevant.issubset(index.docs):
            raise ValueError("Invalid relevance labels for "+case["id"])
        covered.update(relevant)
        ranked=index.rank(case["messages"][-1],index.docs,len(documents))
        first=next((rank for rank,key in enumerate(ranked,1) if key in relevant),None)
        raw.append(dict(id=case["id"],top5=ranked[:5],first_relevant_rank=first,
                        recall=len(relevant.intersection(ranked[:5]))/len(relevant),
                        rr=1/first if first else 0))
    if covered!=set(index.docs):
        raise ValueError("Missing benchmark coverage: "+str(sorted(set(index.docs)-covered)))
    report["index_only"]=dict(covered=len(covered),recall_at_5=sum(r["recall"] for r in raw)/len(raw),
                              mrr=sum(r["rr"] for r in raw)/len(raw),cases=raw)
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
    parser.add_argument("--course",action="store_true",help="Evaluate the 30-document European course subset")
    args=parser.parse_args()
    if args.llm and not os.getenv("RAG_MODEL"):
        parser.error("--llm requires RAG_MODEL")
    report=run(args.llm,args.course)
    if args.out:
        args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Index only:",{k:v for k,v in report["index_only"].items() if k!="cases"})
    for row in report["runs"]:
        print({k:v for k,v in row.items() if k!="cases"})

