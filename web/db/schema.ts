import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const users=sqliteTable('users',{id:text('id').primaryKey(),username:text('username').notNull().unique(),name:text('name').notNull(),dept:text('dept').notNull(),role:text('role').notNull(),status:text('status').notNull(),password:text('password').notNull(),owner:integer('owner').unique(),created:integer('created').notNull()});
export const sessions=sqliteTable('sessions',{hash:text('hash').primaryKey(),user:text('user').notNull().references(()=>users.id),expires:integer('expires').notNull()});
export const invitations=sqliteTable('invitations',{hash:text('hash').primaryKey(),dept:text('dept').notNull(),role:text('role').notNull(),expires:integer('expires').notNull(),createdBy:text('created_by').notNull(),usedBy:text('used_by')});
export const resets=sqliteTable('resets',{hash:text('hash').primaryKey(),user:text('user').notNull(),expires:integer('expires').notNull(),used:integer('used').notNull().default(0)});
export const limits=sqliteTable('limits',{key:text('key').primaryKey(),hits:integer('hits').notNull(),expires:integer('expires').notNull()});
export const workspace=sqliteTable('workspace',{id:integer('id').primaryKey(),version:integer('version').notNull().default(0),data:text('data').notNull()});
