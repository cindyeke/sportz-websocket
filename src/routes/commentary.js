import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/matches.js";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get("/", async (req, res) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);
  const queryParsed = listCommentaryQuerySchema.safeParse(req.query);

  if (!paramsParsed.success) {
    return res.status(400).json({
      error: "Invalid params.",
      details: paramsParsed.error.issues,
    });
  }

  if (!queryParsed.success) {
    return res.status(400).json({
      error: "Invalid query.",
      details: queryParsed.error.issues,
    });
  }

  const limit = Math.min(queryParsed.data.limit ?? 100, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, paramsParsed.data.id))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.json({ data });
  } catch (error) {
    console.error("Failed to list commentary:", error);
    return res.status(500).json({
      error: "Failed to list commentary.",
    });
  }
});

commentaryRouter.post("/", async (req, res) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);
  const bodyParsed = createCommentarySchema.safeParse(req.body);

  if (!paramsParsed.success) {
    return res.status(400).json({
      error: "Invalid params.",
      details: paramsParsed.error.issues,
    });
  }

  if (!bodyParsed.success) {
    return res.status(400).json({
      error: "Invalid payload.",
      details: bodyParsed.error.issues,
    });
  }

  try {
    const [entry] = await db
      .insert(commentary)
      .values({
        matchId: paramsParsed.data.id,
        ...bodyParsed.data,
      })
      .returning();

      if(res.app.locals.broadcastCommentary) {
        res.app.locals.broadcastCommentary(entry.matchId, entry);
      }

    return res.status(201).json({ data: entry });
  } catch (error) {
    console.error("Failed to create commentary:", error);
    return res.status(500).json({
      error: "Failed to create commentary.",
    });
  }
});
