# Google Drive Storage Integration Guide

## Overview

This guide explains how to set up Google Drive as an alternative storage backend for CAD outputs using MCP (Model Context Protocol) servers.

## Why Google Drive?

### Advantages
- **FREE bandwidth** - No egress charges unlike Supabase ($0.09/GB after quota)
- **FREE API usage** - No request limits that incur charges
- **Large free storage** - 15GB free vs 1GB Supabase free tier
- **Familiar interface** - Users can browse files in Google Drive UI
- **MCP integration** - Claude Code can directly access via MCP server

### Disadvantages
- **OAuth complexity** - Requires Google Cloud Console setup and OAuth 2.0
- **Rate limits** - 500K requests/day (though increasable for free)
- **Token management** - Need to handle refresh tokens
- **Not integrated** - Separate from your Supabase auth system

## Setup Steps

### 1. Install Google Drive MCP Server

Choose one implementation:

```bash
# Option A: Official Anthropic MCP server
npm install -g @modelcontextprotocol/server-gdrive

# Option B: Feature-rich community version
npm install -g @piotr-agier/google-drive-mcp
```

### 2. Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Configure OAuth consent screen:
   - Add app name: "Maiyuri Bricks Floor Plan Generator"
   - Add scopes: `https://www.googleapis.com/auth/drive.file`
5. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Add authorized redirect URI: `http://localhost:3000/oauth/callback`
6. Download credentials JSON

### 3. Add MCP Server to Claude Code

Create `.clauderc` in project root:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/oauth/callback"
      }
    }
  }
}
```

### 4. Authenticate

```bash
# First time authentication
npx @modelcontextprotocol/server-gdrive

# Follow the OAuth flow in your browser
# Tokens will be cached for future use
```

## Integration Code

### Google Drive Storage Service

```typescript
// apps/api/src/services/google-drive-storage.ts

import { google } from 'googleapis';
import { Buffer } from 'buffer';

const FOLDER_NAME = 'MaiyuriBricks_FloorPlans';

export class GoogleDriveStorageService {
  private drive;
  private folderId: string | null = null;

  constructor(credentials: any) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(credentials);
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Get or create the root folder for floor plans
   */
  async ensureRootFolder(): Promise<string> {
    if (this.folderId) return this.folderId;

    // Search for existing folder
    const response = await this.drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      this.folderId = response.data.files[0].id!;
      return this.folderId;
    }

    // Create folder if it doesn't exist
    const folder = await this.drive.files.create({
      requestBody: {
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    this.folderId = folder.data.id!;
    return this.folderId;
  }

  /**
   * Upload a file to Google Drive
   */
  async uploadFile(
    sessionId: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ fileId: string; webViewLink: string }> {
    const rootFolderId = await this.ensureRootFolder();

    // Create session folder if needed
    const sessionFolder = await this.drive.files.create({
      requestBody: {
        name: sessionId,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      },
      fields: 'id',
    });

    // Upload file
    const response = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [sessionFolder.data.id!],
      },
      media: {
        mimeType,
        body: fileBuffer,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    return {
      fileId: response.data.id!,
      webViewLink: response.data.webViewLink!,
    };
  }

  /**
   * Get direct download link for a file
   */
  async getDownloadLink(fileId: string): Promise<string> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'webContentLink',
    });
    return response.data.webContentLink!;
  }

  /**
   * Delete all files in a session folder
   */
  async deleteSessionFiles(sessionId: string): Promise<boolean> {
    try {
      const rootFolderId = await this.ensureRootFolder();

      // Find session folder
      const folders = await this.drive.files.list({
        q: `name='${sessionId}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
        fields: 'files(id)',
      });

      if (!folders.data.files || folders.data.files.length === 0) {
        return true;
      }

      const folderId = folders.data.files[0].id!;

      // Delete folder (and all contents)
      await this.drive.files.delete({ fileId: folderId });

      return true;
    } catch (err) {
      console.error('Error deleting session files:', err);
      return false;
    }
  }
}
```

## Usage in Application

```typescript
// After CAD rendering
const driveService = new GoogleDriveStorageService(credentials);

// Upload DXF file
const dxfResult = await driveService.uploadFile(
  sessionId,
  'floor_plan.dxf',
  dxfBuffer,
  'application/octet-stream'
);

// Upload wireframe PNG
const wireframeResult = await driveService.uploadFile(
  sessionId,
  'wireframe.png',
  wireframeBuffer,
  'image/png'
);

// Store Google Drive file IDs in database
await floorPlanSupabase.updateGeneratedImages(sessionId, {
  blueprint: wireframeResult.webViewLink,
  dxf: dxfResult.webViewLink,
});
```

## Accessing Files

### Via MCP in Claude Code

Once the MCP server is configured, I can directly access files:

```typescript
// List files in a session folder
mcp__gdrive__list_files({
  folderId: sessionFolderId,
  pageSize: 50
});

// Read file content
mcp__gdrive__read_file({
  fileId: 'abc123...'
});

// Search for files
mcp__gdrive__search_files({
  query: 'name contains "floor_plan"'
});
```

### Via Google Drive UI

Users can:
1. Browse to `MaiyuriBricks_FloorPlans` folder
2. Navigate to session folders (by session ID)
3. Download DXF, PNG, or other files directly
4. Share files with collaborators using Google Drive sharing

## Environment Variables

Add to `.env.local`:

```bash
# Google Drive OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback

# Store refresh token after first auth
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

## Production Considerations

### Token Management
- Store refresh tokens securely (use Supabase vault or encrypted environment variables)
- Implement token refresh logic for long-running services
- Use service accounts for backend-only operations

### Rate Limits
- Google Drive API: 500K requests/day (free to increase)
- Implement caching to reduce API calls
- Batch operations when possible

### Security
- Use file-scoped permissions (`drive.file` scope, not `drive`)
- Files created by your app are only accessible by your app
- Implement proper RLS if exposing file IDs to users

## Cost Projection

For 1000 floor plan generations/month:

| Item | Google Drive | Supabase |
|------|-------------|----------|
| Storage (50MB avg × 1000) | $0 (under 15GB free) | $25/mo (Pro plan) |
| Bandwidth (downloads) | $0 (FREE) | $0.09/GB × 50GB = $4.50 |
| API requests | $0 (FREE) | $0 (included) |
| **Total** | **$0** | **$29.50/mo** |

**At scale (10K generations):** Google Drive remains free with no bandwidth costs, while Supabase would cost $70-100/mo in bandwidth alone.

## Recommendation

**Use Google Drive if:**
- ✅ You expect high download bandwidth (saves $$$)
- ✅ You want users to manage files in Google Drive UI
- ✅ You're comfortable with OAuth 2.0 setup
- ✅ Files are private per-user (not shared across accounts)

**Use Supabase Storage if:**
- ✅ You need tight integration with existing auth system
- ✅ You want simpler setup (no OAuth flow)
- ✅ You need RLS with complex policies
- ✅ Bandwidth is low and you value simplicity

## Hybrid Approach (Best of Both Worlds)

Store metadata in Supabase, large files in Google Drive:

```typescript
// Supabase: Session metadata, inputs, small data
await supabase.from('floor_plan_sessions').insert({
  id: sessionId,
  user_id: userId,
  // ... other metadata
  gdrive_folder_id: sessionFolderId // Reference to Google Drive
});

// Google Drive: Large DXF/PNG files
await driveService.uploadFile(sessionId, 'plan.dxf', buffer, 'application/octet-stream');
```

This gives you:
- Supabase auth + RLS for security
- Google Drive's free bandwidth for large files
- Best of both platforms

## Sources

- [Google Drive MCP Servers](https://github.com/piotr-agier/google-drive-mcp)
- [Official MCP Google Drive](https://www.npmjs.com/package/@modelcontextprotocol/server-gdrive)
- [Google Drive API Overview](https://developers.google.com/workspace/drive/api/guides/about-sdk)
- [Google Drive Usage Limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [Supabase Storage Pricing](https://supabase.com/docs/guides/storage/pricing)
