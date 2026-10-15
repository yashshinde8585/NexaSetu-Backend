// Mock for Octokit in testing environment to avoid ESM import issues in Jest
class OctokitMock {
  constructor(options = {}) {
    this.options = options;
    this.rest = {
      repos: {
        get: jest.fn().mockResolvedValue({ data: {} }),
        listForAuthenticatedUser: jest.fn().mockResolvedValue({ data: [] }),
        listCommits: jest.fn().mockResolvedValue({ data: [] }),
        getCommit: jest.fn().mockResolvedValue({ data: { files: [] } }),
      },
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        get: jest.fn().mockResolvedValue({ data: {} }),
        listFiles: jest.fn().mockResolvedValue({ data: [] }),
      },
      issues: {
        listForRepo: jest.fn().mockResolvedValue({ data: [] }),
      },
      users: {
        getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'mock-user' } }),
      },
    };
  }
}

module.exports = {
  Octokit: OctokitMock,
};
