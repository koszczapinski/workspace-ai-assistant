import { and,eq } from 'drizzle-orm';
import { db } from './db'; import { memberships,workspaces } from './schema';
export async function listWorkspaces(userId:string){if(!db)return [];return db.select({id:workspaces.id,name:workspaces.name}).from(workspaces).innerJoin(memberships,eq(workspaces.id,memberships.workspaceId)).where(eq(memberships.userId,userId));}
export async function authorizedWorkspace(userId:string,id:string){if(!db)return null;const [w]=await db.select({id:workspaces.id,name:workspaces.name,assistantInstructions:workspaces.assistantInstructions}).from(workspaces).innerJoin(memberships,eq(workspaces.id,memberships.workspaceId)).where(and(eq(memberships.userId,userId),eq(workspaces.id,id))).limit(1);return w??null;}
