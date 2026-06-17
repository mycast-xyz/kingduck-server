import { google } from 'googleapis';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  logger.warn('WARNING: YOUTUBE_API_KEY is not defined in .env');
}

export const youtube = google.youtube({
  version: 'v3',
  auth: API_KEY,
});
