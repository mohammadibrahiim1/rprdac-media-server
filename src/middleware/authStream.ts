import { Request, Response, NextFunction } from "express";

import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

interface DecodedToken {
  userId: string;
  role: string;
  courseId?: string;
  [key: string]: any;
}

export const authStream = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    let token = "";

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      res.status(401).json({ error: "Access denied." });
      return;
    }

    const secretKey = process.env.STREAM_JWT_SECRET || process.env.JWT_SK;

    if (!secretKey) {
      res.status(500).json({ error: "Internal server error." });
      return;
    }

    const decoded = jwt.verify(token, secretKey) as DecodedToken;

    req.user = decoded;

    next();
  } catch (error) {
    // Token er meyad sesh hoye gele user-ke friendly message dewa
    if (error instanceof jwt.TokenExpiredError) {
      res.status(403).json({
        error:
          "Session Expired. Please login again to continue watching the video.",
      });
      return;
    }

    // Onnanno invalid token er khetre
    res
      .status(403)
      .json({ error: "Ei video-ti dekhar bohidhona (permission) apnar nei." });
    return;
  }
};
