# 📊 Compare Papers — Structured Analysis

**Papers Compared:**
- *Do We Still Need GraphRAG? Benchmarking RAG and GraphRAG for Agentic Search Systems*
- *GraphRAG under Fire*

---

## 1. Comparative Overview

**Do We Still Need GraphRAG?**
- Investigates whether GraphRAG is still necessary in modern agentic search systems
- Benchmarks RAG vs GraphRAG across multiple QA datasets
- Backbone: Large Language Models integrated with GraphRAG
- Key finding: GraphRAG remains valuable for complex multi-hop reasoning; agentic search alone cannot fully replace explicit graph structure

**GraphRAG under Fire**
- Focuses on robustness and security of GraphRAG against poisoning attacks
- Does not compare against RAG; studies GraphRAG in isolation
- Key finding: GraphRAG achieves up to 98% attack success rate using < 68% poisoning text, demonstrating high scalability under adversarial conditions

**Key Contrast:**
- One paper questions GraphRAG's necessity; the other demonstrates its resilience
- Different primary goals: performance utility vs. adversarial robustness

---

## 2. Architectural Approaches & Backbones

**Do We Still Need GraphRAG?**
- Backbone: Large Language Models (LLMs) + GraphRAG pipeline
- Tests complementary effects of LLMs and graph structure together
- Explicit graph structure helps in complex reasoning tasks

**GraphRAG under Fire**
- Studies GraphRAG architecture standalone
- No additional model integration; focus is on intrinsic defense mechanisms
- Analyses graph construction's role in resisting poisoning

**Key Contrast:**
- Multi-model integration vs. single-model deep-dive
- Performance synergy vs. security analysis

---

## 3. Training Datasets & Evaluation Benchmarks

**Do We Still Need GraphRAG?**
- Uses multiple QA benchmarks (diverse tasks)
- Metrics: answer accuracy, preprocessing cost, inference efficiency, stability
- Broader evaluation scope across varied question types

**GraphRAG under Fire**
- Uses datasets simulating poisoning attack scenarios
- Metrics: attack success rate, volume of poisoning text needed, scalability
- Narrow but deep evaluation focused on adversarial resilience

**Key Contrast:**
- General performance benchmarks vs. adversarial/security-specific benchmarks
- Multi-metric vs. attack-centric metrics

---

## 4. Empirical Performance & Trade-offs

**Do We Still Need GraphRAG?**
- ✅ Improved answer accuracy and response stability with GraphRAG
- ❌ Higher offline preprocessing cost
- ❌ Potential online inference inefficiency
- Best suited for: multi-hop reasoning, tasks needing structural knowledge

**GraphRAG under Fire**
- ✅ High robustness against poisoning attacks (up to 98% success rate)
- ✅ Scalable defenses with minimal poisoning text required (< 68%)
- ❌ No direct performance comparison against alternative RAG models

**Key Contrast:**
- Utility vs. security trade-offs
- Performance cost of graph structure vs. security benefit of it

---

## 5. Limitations & Open Research Gaps

**Do We Still Need GraphRAG?**
- Existing benchmarks may not reflect real-world QA complexity
- Unclear how far agentic search can compensate for missing graph structure
- Integration complexity between LLMs and GraphRAG not fully resolved

**GraphRAG under Fire**
- Defensive measures against poisoning still need deeper exploration
- Vulnerabilities beyond poisoning attacks not studied
- Security guarantees in diverse real-world deployments unclear

**Shared Gaps:**
- Need for more robust evaluation benchmarks
- Efficiency of graph-based models in production-scale systems
- Understanding failure modes under distribution shift

---

## 6. Synthesis & Conclusions

**What both papers agree on:**
- GraphRAG remains relevant and continues to play an important role in NLP pipelines
- Explicit graph structure provides unique advantages that flat RAG cannot fully replicate

**What diverges:**
- *Do We Still Need GraphRAG?* → Most valuable in multi-hop / complex reasoning tasks
- *GraphRAG under Fire* → GraphRAG's architecture has inherent robustness properties worth preserving

**Takeaways:**
- Use GraphRAG when tasks require structural reasoning over connected knowledge
- GraphRAG's graph construction naturally resists certain adversarial manipulation
- Future work: better integration strategies, cheaper graph preprocessing, and stronger adversarial defenses
