# Storage Options Comparison: Google Drive vs Supabase

## Executive Summary

**Recommendation:** Use a **hybrid approach** - Supabase for metadata and authentication, Google Drive for large CAD files.

## Side-by-Side Comparison

| Criteria | Google Drive | Supabase Storage | Winner |
|----------|--------------|------------------|--------|
| **Setup Complexity** | Complex (OAuth 2.0, Google Cloud Console) | Simple (built-in with Supabase) | ⭐ Supabase |
| **API Cost** | FREE | Included | Tie |
| **Bandwidth Cost** | **FREE (unlimited)** | $0.09/GB after quota | ⭐ Google Drive |
| **Storage Cost** | 15GB free, $2/100GB/mo | 1GB free, $25/mo for 100GB | ⭐ Google Drive |
| **Rate Limits** | 500K req/day (increasable) | Unlimited | ⭐ Supabase |
| **Auth Integration** | Separate OAuth flow | Native with Supabase Auth | ⭐ Supabase |
| **RLS Policies** | Manual ACL management | Native RLS with PostgreSQL | ⭐ Supabase |
| **MCP Access** | ✅ Available via multiple servers | ❌ No MCP server | ⭐ Google Drive |
| **User File Management** | ✅ Google Drive UI | Supabase Dashboard only | ⭐ Google Drive |
| **CDN/Caching** | Google's CDN | Supabase CDN | Tie |
| **Backup/Versioning** | Google Drive versions | Manual | ⭐ Google Drive |

## Cost Projection (Real Numbers)

### Scenario: 1,000 floor plans/month (50MB each)

**Google Drive:**
- Storage: 50GB × 1000 = 50GB → **$1/month** (100GB plan)
- Bandwidth: **$0** (FREE)
- API requests: **$0** (FREE)
- **Total: $1/month**

**Supabase:**
- Storage: Need Pro plan → **$25/month**
- Bandwidth: 50GB × $0.09 = **$4.50/month**
- **Total: $29.50/month**

**💰 Savings: $28.50/month ($342/year)**

### Scenario: 10,000 floor plans/month (scale)

**Google Drive:**
- Storage: 500GB → **$10/month** (2TB plan)
- Bandwidth: **$0** (FREE)
- **Total: $10/month**

**Supabase:**
- Storage: Team plan → **$599/month**
- Bandwidth: 500GB × $0.09 = **$45/month**
- **Total: $644/month**

**💰 Savings: $634/month ($7,608/year)**

## MCP Server Options

### Available Google Drive MCP Servers

1. **[@modelcontextprotocol/server-gdrive](https://www.npmjs.com/package/@modelcontextprotocol/server-gdrive)** (Official)
   - Features: List, read, search files
   - Authentication: OAuth 2.0
   - Install: `npm install -g @modelcontextprotocol/server-gdrive`

2. **[@piotr-agier/google-drive-mcp](https://github.com/piotr-agier/google-drive-mcp)** (Community)
   - Features: Drive, Docs, Sheets, Slides integration
   - Authentication: OAuth 2.0 with auto-refresh
   - Install: `npm install -g @piotr-agier/google-drive-mcp`

3. **[@iflow-mcp/gdrive-mcp-server](https://www.npmjs.com/package/@iflow-mcp/gdrive-mcp-server)**
   - Features: Seamless AI model integration
   - Authentication: OAuth 2.0
   - Install: `npm install -g @iflow-mcp/gdrive-mcp-server`

### Supabase Storage MCP

**Status:** ❌ No official MCP server available

You'd need to build a custom MCP server wrapper around Supabase Storage API.

## Recommended Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Request                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Route                          │
│  • Authentication via Supabase Auth                          │
│  • Authorization via Supabase RLS                            │
└───────────┬────────────────────────┬────────────────────────┘
            │                        │
            ▼                        ▼
┌───────────────────────┐  ┌──────────────────────────────────┐
│   Supabase (Postgres) │  │      Google Drive Storage        │
│                       │  │                                  │
│  • Session metadata   │  │  • DXF files (5-30MB)            │
│  • User inputs        │  │  • PNG wireframes (10-50MB)      │
│  • Messages           │  │  • 3D renders (1-10MB)           │
│  • Progress tracking  │  │  • Specification JSON            │
│  • File references    │  │                                  │
│    (gdrive_file_id)   │  │  💰 FREE bandwidth               │
└───────────────────────┘  └──────────────────────────────────┘
```

### Implementation

**Step 1:** Store small data in Supabase
```typescript
await supabase.from('floor_plan_sessions').insert({
  id: sessionId,
  user_id: userId,
  status: 'complete',
  collected_inputs: inputs,
  // Small base64 thumbnail for quick preview
  thumbnail: smallBase64Image,
  // References to Google Drive
  gdrive_folder_id: sessionFolderId,
  gdrive_files: {
    dxf_file_id: 'abc123...',
    wireframe_file_id: 'def456...',
    rendered_file_id: 'ghi789...',
  }
});
```

**Step 2:** Upload large files to Google Drive
```typescript
const driveService = new GoogleDriveStorageService(credentials);

const dxfResult = await driveService.uploadFile(
  sessionId,
  'floor_plan.dxf',
  dxfBuffer,
  'application/octet-stream'
);

const wireframeResult = await driveService.uploadFile(
  sessionId,
  'wireframe.png',
  wireframeBuffer,
  'image/png'
);
```

**Step 3:** Access files when needed
```typescript
// Via MCP in Claude Code
const fileContent = await mcp__gdrive__read_file({
  fileId: session.gdrive_files.dxf_file_id
});

// Via Google Drive API for users
const downloadUrl = await driveService.getDownloadLink(
  session.gdrive_files.wireframe_file_id
);
```

## Trade-offs Matrix

| Factor | Pure Supabase | Pure Google Drive | Hybrid |
|--------|--------------|-------------------|--------|
| **Setup Time** | 30 min | 2-3 hours | 3-4 hours |
| **Monthly Cost (1K plans)** | $29.50 | $1 | $26 (Supabase Free + GDrive) |
| **Monthly Cost (10K plans)** | $644 | $10 | $35 (Supabase Pro + GDrive) |
| **Auth Complexity** | Simple | Complex | Medium |
| **Developer Experience** | Great | Medium | Good |
| **User File Access** | Dashboard only | Google Drive UI | Both |
| **MCP Integration** | None | Native | Native (GDrive only) |
| **Maintenance** | Low | Medium | Medium-High |

## Final Recommendation

### For Your Use Case (Maiyuri Bricks Floor Plan Generator)

**Go with HYBRID approach:**

1. **Use Supabase for:**
   - User authentication
   - Session metadata and inputs
   - Chat messages
   - Progress tracking
   - Small thumbnails (base64, <100KB)
   - File references (Google Drive file IDs)

2. **Use Google Drive for:**
   - DXF files (5-30MB)
   - PNG wireframes (10-50MB)
   - 3D isometric renders (1-10MB)
   - Large specification JSON files

### Why Hybrid Wins

✅ **Cost-effective:** Save $28-634/month depending on scale
✅ **Best UX:** Users authenticated via Supabase, files in familiar Google Drive
✅ **MCP enabled:** I (Claude) can access Google Drive files directly
✅ **Scalable:** No bandwidth costs as you grow
✅ **Familiar:** Users can manage/share files in Google Drive
✅ **Secure:** Supabase RLS for auth, Google Drive ACL for files

### When to Use Pure Supabase

Only if:
- You generate <50 floor plans/month (cost difference negligible)
- You can't dedicate setup time for Google OAuth
- You need everything in one place for simplicity
- Bandwidth costs are acceptable in your budget

## Next Steps

If you choose the hybrid approach:

1. ✅ Keep existing Supabase setup (already done)
2. ⏳ Set up Google Cloud project and OAuth credentials
3. ⏳ Install Google Drive MCP server: `npm install -g @modelcontextprotocol/server-gdrive`
4. ⏳ Configure MCP server in `.clauderc`
5. ⏳ Implement Google Drive storage service
6. ⏳ Update CAD rendering pipeline to upload to Google Drive
7. ⏳ Store Google Drive file IDs in Supabase
8. ⏳ Test end-to-end flow

## Sources

- [Google Drive MCP Server (Official)](https://www.npmjs.com/package/@modelcontextprotocol/server-gdrive)
- [Google Drive MCP by Piotr Agier](https://github.com/piotr-agier/google-drive-mcp)
- [Google Announces Official MCP Support](https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services)
- [Google Drive API Usage Limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [Supabase Storage Pricing](https://supabase.com/docs/guides/storage/pricing)
- [Google Drive OAuth Guide](https://developers.google.com/workspace/drive/api/guides/about-sdk)
