import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.bird.com",
  description: "MCP server at mcp.bird.com.",
  auth: connect("bird/cyan-pocket"),
});
