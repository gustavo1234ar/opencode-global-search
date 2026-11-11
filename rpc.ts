import { Rpc } from "@opencode/plugin/rpc"

export const GlobalSearch = Rpc.define({
  id: "global-search",
  methods: {
    search: {
      errors: {},
      input: {
        type: "object",
        properties: {
          query: { type: "string" },
          since: { type: "string" },
          session: { type: "string" },
          role: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                t: { type: "number" },
                sid: { type: "string" },
                role: { type: "string" },
                title: { type: "string" },
                excerpt: { type: "string" },
              },
              required: ["t", "sid", "role", "title", "excerpt"],
              additionalProperties: false,
            },
          },
        },
        required: ["results"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
