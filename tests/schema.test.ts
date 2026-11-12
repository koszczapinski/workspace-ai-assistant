import { describe, expect, it } from 'vitest';
import { memberships, workspaces, user } from '../src/lib/schema';

describe('database schema',()=>{
 it('defines the workspace and membership domain tables',()=>{
  expect(workspaces).toBeDefined(); expect(memberships).toBeDefined(); expect(user).toBeDefined();
  expect(Object.keys(workspaces)).toContain('name');
  expect(Object.keys(memberships)).toContain('workspaceId');
 });
});
