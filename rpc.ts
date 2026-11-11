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
    sessions: {
      errors: {},
      input: {
        type: "object",
        properties: { limit: { type: "number" } },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                updated: { type: "number" },
              },
              required: ["id", "title", "updated"],
              additionalProperties: false,
            },
          },
        },
        required: ["sessions"],
        additionalProperties: false,
      },
    },
    groups: {
      errors: {},
      input: {
        type: "object",
        properties: {
          query: { type: "string" },
          since: { type: "string" },
          session: { type: "string" },
          role: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sid: { type: "string" },
                title: { type: "string" },
                count: { type: "number" },
                last: { type: "number" },
              },
              required: ["sid", "title", "count", "last"],
              additionalProperties: false,
            },
          },
        },
        required: ["sessions"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
