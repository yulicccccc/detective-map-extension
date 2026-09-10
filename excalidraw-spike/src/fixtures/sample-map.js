// Real Ground Truth snapshot from Detective Map production (ws_default)
export const initialConcepts = [
  {
    id: "c_5d6601f0d6",
    workspaceId: "ws_default",
    label: "Spaced Repetition",
    description: "Improves long-term retention by increasing the interval between successful reviews.\n• Revisits the same material in separate sessions spread over time, rather than reviewing repeatedly in one sitting.\n• Working Memory plays a crucial role in the processing and maintenance of information during learning, which can impact the effectiveness of Spaced Repetition.",
    x: 150,
    y: 150,
    width: 240,
    pinned: false,
    createdAt: "2026-08-26T22:37:51.038Z",
    updatedAt: "2026-09-03T16:20:00.767Z",
    sourceRefs: [
      "src_1787783840521_r4j1sz",
      "src_1787847246844_w2mxm6",
      "src_1788451627959_ucj9tm"
    ],
    createdBy: "ai"
  },
  {
    id: "c_bd83ca3341",
    workspaceId: "ws_default",
    label: "Verified Cloud Sync",
    description: "Quote from Antigravity test suite confirming cloud sync functionality.",
    x: 380,
    y: 20,
    width: 240,
    pinned: false,
    createdAt: "2026-08-26T22:52:49.231Z",
    updatedAt: "2026-08-27T19:53:27.230Z",
    sourceRefs: [
      "test-quote-1787700112409"
    ],
    createdBy: "ai"
  },
  {
    id: "c_4935e58245",
    workspaceId: "ws_default",
    label: "Optimized Interval",
    description: "Gradually increasing review intervals",
    x: 580,
    y: 120,
    width: 240,
    pinned: false,
    createdAt: "2026-08-27T14:36:28.151Z",
    updatedAt: "2026-09-03T16:07:43.339Z",
    sourceRefs: [
      "src_1787784148920_wr1rfy"
    ],
    createdBy: "ai"
  },
  {
    id: "c_578f56fb6f",
    workspaceId: "ws_default",
    label: "Distributed Practice",
    description: "General learning methodology organizing learning across multiple sessions for skills, facts, and problem solving.",
    x: 800,
    y: 160,
    width: 240,
    pinned: false,
    createdAt: "2026-08-27T17:39:08.300Z",
    updatedAt: "2026-09-03T16:21:01.129Z",
    sourceRefs: [
      "src_1787852236656_858j1t"
    ],
    createdBy: "ai"
  },
  {
    id: "c_de3dcb3d41",
    workspaceId: "ws_default",
    label: "Elaborative Interrogation",
    description: "Learning method that asks learners to explain why a fact is true.",
    x: 1050,
    y: 60,
    width: 240,
    pinned: false,
    createdAt: "2026-08-27T18:31:58.641Z",
    updatedAt: "2026-08-28T13:32:54.766Z",
    sourceRefs: [
      "src_1787855451872_rkrxf5"
    ],
    createdBy: "ai"
  },
  {
    id: "c_efa58f7e85",
    workspaceId: "ws_default",
    label: "Elaborative Rehearsal",
    description: "Improves memory by actively connecting new information with existing knowledge and forming meaningful associations.",
    x: 150,
    y: 380,
    width: 240,
    pinned: false,
    createdAt: "2026-08-27T20:40:26.662Z",
    updatedAt: "2026-08-27T22:02:46.808Z",
    sourceRefs: [
      "src_1787862879279_j8jgt3"
    ],
    createdBy: "ai"
  },
  {
    id: "c_d7c2f22bc8",
    workspaceId: "ws_default",
    label: "Method of Loci",
    description: "Improves recall by associating information with imagined spatial locations along a familiar route.",
    x: 460,
    y: 460,
    width: 240,
    pinned: false,
    createdAt: "2026-08-27T21:34:05.103Z",
    updatedAt: "2026-09-03T16:07:37.256Z",
    sourceRefs: [
      "src_1787866391905_cp32bi"
    ],
    createdBy: "ai"
  },
  {
    id: "c_2fb873a17a",
    workspaceId: "ws_default",
    label: "Working Memory",
    description: "Temporary system for processing and maintaining information in short-term memory.",
    x: 780,
    y: 340,
    width: 240,
    pinned: false,
    createdAt: "2026-09-03T16:07:18.955Z",
    updatedAt: "2026-09-03T16:07:35.005Z",
    sourceRefs: [
      "src_1788451627959_ucj9tm"
    ],
    createdBy: "ai"
  }
];

export const initialEdges = [
  {
    id: "e_578e1ceca4",
    workspaceId: "ws_default",
    fromId: "c_5d6601f0d6",
    toId: "c_4935e58245",
    relation: "enhances",
    label: "increases effectiveness",
    sourceRefs: ["src_1787784148920_wr1rfy"],
    createdBy: "ai"
  },
  {
    id: "e_95ba3e7003",
    workspaceId: "ws_default",
    fromId: "c_de3dcb3d41",
    toId: "c_578f56fb6f",
    relation: "can be combined with",
    label: "complementary learning methodology",
    sourceRefs: ["src_1787855451872_rkrxf5"],
    createdBy: "ai"
  },
  {
    id: "e_9e345e5cad",
    workspaceId: "ws_default",
    fromId: "c_2fb873a17a",
    toId: "c_5d6601f0d6",
    relation: "supports",
    label: "cognitive system for processing information",
    sourceRefs: ["src_1788451627959_ucj9tm"],
    createdBy: "ai"
  },
  {
    id: "e_ef0d2301be",
    workspaceId: "ws_default",
    fromId: "c_2fb873a17a",
    toId: "c_efa58f7e85",
    relation: "supports",
    label: "cognitive system for forming associations",
    sourceRefs: ["src_1788451627959_ucj9tm"],
    createdBy: "ai"
  },
  {
    id: "e_2c04b3784f",
    workspaceId: "ws_default",
    fromId: "c_2fb873a17a",
    toId: "c_d7c2f22bc8",
    relation: "supports",
    label: "cognitive system for recall",
    sourceRefs: ["src_1788451627959_ucj9tm"],
    createdBy: "ai"
  }
];
