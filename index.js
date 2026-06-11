require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sendError = (res, status, message) =>
  res.status(status).json({ error: message });

const formatEntry = (entry) => ({
  id: entry.entryId,
  title: entry.title,
  content: entry.content,
  mood: entry.mood ?? null,
  date: entry.date,
  userId: entry.userId,
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.status(200).json({ message: "College Diary API is running." });
});

// ─── Users ────────────────────────────────────────────────────────────────────

// POST /users — create a new user
app.post("/users", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== "string" || !name.trim())
      return sendError(res, 400, "name is required");
    if (!email || typeof email !== "string" || !email.trim())
      return sendError(res, 400, "email is required");
    if (!password || typeof password !== "string" || !password.trim())
      return sendError(res, 400, "password is required");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim()))
      return sendError(res, 400, "email is not valid");

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    if (error.code === "P2002")
      return sendError(res, 409, "Email already exists");
    console.error(error);
    sendError(res, 500, "Unable to create user");
  }
});

// GET /users/:userId — get a single user by ID
app.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) return sendError(res, 404, "User not found");

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Unable to fetch user");
  }
});

// ─── Entries ──────────────────────────────────────────────────────────────────

// POST /entries — create a new diary entry
app.post("/entries", async (req, res) => {
  try {
    const { title, content, mood, userId } = req.body;

    if (!title || typeof title !== "string" || !title.trim())
      return sendError(res, 400, "title is required");
    if (!content || typeof content !== "string" || !content.trim())
      return sendError(res, 400, "content is required");
    if (!userId || typeof userId !== "string" || !userId.trim())
      return sendError(res, 400, "userId is required");

    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) return sendError(res, 404, "User not found");

    const entry = await prisma.diaryEntry.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        mood: mood ? String(mood).trim() : null,
        userId,
      },
    });

    res.status(201).json(formatEntry(entry));
  } catch (error) {
    if (error.code === "P2003")
      return sendError(res, 404, "User not found");
    console.error(error);
    sendError(res, 500, "Unable to create entry");
  }
});

// GET /entries — list all entries, ordered by date desc
// Optional query param: ?userId= to filter by user
app.get("/entries", async (req, res) => {
  try {
    const { userId } = req.query;
    const where = userId ? { userId } : {};

    const entries = await prisma.diaryEntry.findMany({
      where,
      orderBy: { date: "desc" },
    });

    res.status(200).json(entries.map(formatEntry));
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Unable to fetch entries");
  }
});

// GET /entries/:entryId — get a single diary entry
app.get("/entries/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    const entry = await prisma.diaryEntry.findUnique({ where: { entryId } });

    if (!entry) return sendError(res, 404, "Entry not found");

    res.status(200).json(formatEntry(entry));
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Unable to fetch entry");
  }
});

// PUT /entries/:entryId — update a diary entry (partial update supported)
app.put("/entries/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    const { title, content, mood } = req.body;

    if (title === undefined && content === undefined && mood === undefined)
      return sendError(
        res,
        400,
        "At least one of title, content, or mood must be provided"
      );

    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim())
        return sendError(res, 400, "title must be a non-empty string");
      data.title = title.trim();
    }

    if (content !== undefined) {
      if (typeof content !== "string" || !content.trim())
        return sendError(res, 400, "content must be a non-empty string");
      data.content = content.trim();
    }

    if (mood !== undefined) {
      data.mood = mood === null ? null : String(mood).trim();
    }

    const entry = await prisma.diaryEntry.update({
      where: { entryId },
      data,
    });

    res.status(200).json(formatEntry(entry));
  } catch (error) {
    if (error.code === "P2025")
      return sendError(res, 404, "Entry not found");
    console.error(error);
    sendError(res, 500, "Unable to update entry");
  }
});

// DELETE /entries/:entryId — delete a diary entry
app.delete("/entries/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    await prisma.diaryEntry.delete({ where: { entryId } });
    res.status(204).send();
  } catch (error) {
    if (error.code === "P2025")
      return sendError(res, 404, "Entry not found");
    console.error(error);
    sendError(res, 500, "Unable to delete entry");
  }
});

// ─── Catch-all & Global Error Handler ────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`College Diary API running on http://localhost:${PORT}`);
});
