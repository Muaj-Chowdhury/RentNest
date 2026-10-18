# Taste

- Communicates by highlighting a specific symbol/line in the IDE and asking for a conceptual walkthrough (e.g. "explain X how does it work and the flow"), so prefers thorough, step-by-step explanations that trace the call flow and reference exact file:line locations rather than short one-line answers. Confidence: 0.8
- When asking about code, wants the full picture: distinct scenarios/branches, the data flow end-to-end, and the rationale for decisions (e.g. "what should each return carry and how do I know"), not just a description of what the code literally does. Confidence: 0.7
- Explicitly asks for the common pitfalls — the mistakes and steps developers most often forget to implement — so explanations should call out likely bugs/omissions (missing guards, wrong ordering, forgotten side effects). Confidence: 0.7
