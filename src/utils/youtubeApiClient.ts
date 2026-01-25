import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.warn('WARNING: YOUTUBE_API_KEY is not defined in .env');
}

export const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY,
});
