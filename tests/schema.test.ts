import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { conversations, memberships, messages, workspaces, user } from '../src/lib/schema';

describe('database schema',()=>{
 it('defines the workspace and membership domain tables',()=>{
  expect(workspaces).toBeDefined(); expect(memberships).toBeDefined(); expect(user).toBeDefined();
  expect(Object.keys(workspaces)).toContain('name');
  expect(Object.keys(memberships)).toContain('workspaceId');
 });

 it('defines Conversations and their messages with timezone-aware timestamps',()=>{
  const conversation=getTableConfig(conversations); const message=getTableConfig(messages);
  expect(conversation.name).toBe('conversations'); expect(message.name).toBe('messages');
  const tz=(table:typeof conversation)=>table.columns.filter(c=>c.columnType==='PgTimestamp').map(c=>[c.name,(c as unknown as {withTimezone:boolean}).withTimezone]);
  expect(tz(conversation)).toEqual([['created_at',true],['updated_at',true]]);
  expect(tz(message)).toEqual([['created_at',true]]);
  expect(message.columns.map(c=>c.name)).toEqual(['id','conversation_id','role','content','stopped','created_at']);
  expect(message.foreignKeys.map(fk=>fk.onDelete)).toEqual(['cascade']);
  expect(conversation.foreignKeys.map(fk=>fk.onDelete)).toEqual(['cascade','cascade']);
 });
});
