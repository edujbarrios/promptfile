/**
 * GitHub tool — reads issues, PRs, commits, and file contents from GitHub.
 * Requires GITHUB_TOKEN environment variable (or explicit token option).
 */
import { BaseTool } from './base.js';
import type { ToolResult } from './base.js';

interface GitHubFileResponse {
  content: string;
  encoding: string;
}

export class GitHubTool extends BaseTool {
  readonly name = 'github';
  readonly description =
    'Interact with GitHub: read issues, pull requests, commits, and repository files.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get_issue', 'list_issues', 'get_pr', 'get_file', 'list_prs'],
        description: 'The GitHub action to perform',
      },
      repo: {
        type: 'string',
        description: 'Repository in owner/name format (e.g. "octocat/hello-world")',
      },
      number: {
        type: 'number',
        description: 'Issue or PR number',
      },
      path: {
        type: 'string',
        description: 'File path within the repository',
      },
    },
    required: ['action', 'repo'],
  };

  private token: string;

  constructor(options?: Record<string, string>) {
    super();
    this.token = options?.['token'] ?? process.env['GITHUB_TOKEN'] ?? '';
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!this.token) {
      return { success: false, error: 'GITHUB_TOKEN is not set' };
    }

    const action = params['action'] as string;
    const repo = params['repo'] as string;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfile/0.1',
    };

    try {
      switch (action) {
        case 'get_issue': {
          const number = params['number'] as number;
          const res = await fetch(
            `https://api.github.com/repos/${repo}/issues/${number}`,
            { headers },
          );
          if (!res.ok) return { success: false, error: `GitHub API ${res.status}` };
          return { success: true, data: await res.json() };
        }

        case 'list_issues': {
          const res = await fetch(
            `https://api.github.com/repos/${repo}/issues?state=open&per_page=20`,
            { headers },
          );
          if (!res.ok) return { success: false, error: `GitHub API ${res.status}` };
          return { success: true, data: await res.json() };
        }

        case 'get_pr': {
          const number = params['number'] as number;
          const res = await fetch(
            `https://api.github.com/repos/${repo}/pulls/${number}`,
            { headers },
          );
          if (!res.ok) return { success: false, error: `GitHub API ${res.status}` };
          return { success: true, data: await res.json() };
        }

        case 'list_prs': {
          const res = await fetch(
            `https://api.github.com/repos/${repo}/pulls?state=open&per_page=20`,
            { headers },
          );
          if (!res.ok) return { success: false, error: `GitHub API ${res.status}` };
          return { success: true, data: await res.json() };
        }

        case 'get_file': {
          const path = params['path'] as string;
          const res = await fetch(
            `https://api.github.com/repos/${repo}/contents/${path}`,
            { headers },
          );
          if (!res.ok) return { success: false, error: `GitHub API ${res.status}` };
          const data = (await res.json()) as GitHubFileResponse;
          const content = Buffer.from(data.content, data.encoding as BufferEncoding).toString(
            'utf-8',
          );
          return { success: true, data: { path, content } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
