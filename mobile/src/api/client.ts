import axios from 'axios';

export const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/bff/mobile/',
  timeout: 10000,
});
