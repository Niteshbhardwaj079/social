import axiosClient from './axiosClient';

/**
 * AI Studio on the Social API (only used when API_ENABLED).
 * AI requests can take a while (an image ~10-30 s), so they get a longer timeout than the usual 15 s.
 */
const AI_TIMEOUT_MS = 180000;

/** Can this person see / use AI right now, and how many credits are left? */
export const getAiAccess = () => axiosClient.get('/ai/access').then((response) => response.data);

export const writePosts = (values) => axiosClient.post('/ai/text', values, { timeout: AI_TIMEOUT_MS }).then((response) => response.data);

export const createImage = (values) => axiosClient.post('/ai/image', values, { timeout: AI_TIMEOUT_MS }).then((response) => response.data);

/** Slideshow / AI video run in the background: these return a generation to poll with getGeneration(). */
export const createSlideshow = (values) => axiosClient.post('/ai/slideshow', values, { timeout: AI_TIMEOUT_MS }).then((response) => response.data.generation);

export const createVideo = (values) => axiosClient.post('/ai/video', values, { timeout: AI_TIMEOUT_MS }).then((response) => response.data.generation);

export const getGeneration = (id) => axiosClient.get(`/ai/generations/${id}`).then((response) => response.data.generation);

export const getGenerations = () => axiosClient.get('/ai/generations').then((response) => response.data.generations);

// ---------------------------------------------------------------- autopilots
export const getAutopilots = () => axiosClient.get('/ai/autopilots').then((response) => response.data.autopilots);

export const createAutopilot = (values) => axiosClient.post('/ai/autopilots', values).then((response) => response.data.autopilot);

export const updateAutopilot = (id, changes) => axiosClient.patch(`/ai/autopilots/${id}`, changes).then((response) => response.data.autopilot);

export const deleteAutopilot = (id) => axiosClient.delete(`/ai/autopilots/${id}`).then((response) => response.data);

export const runAutopilotNow = (id) => axiosClient.post(`/ai/autopilots/${id}/run`, null, { timeout: AI_TIMEOUT_MS }).then((response) => response.data);

// ---------------------------------------------------------------- Settings → AI
export const getAiSettings = () => axiosClient.get('/ai/settings').then((response) => response.data);

export const saveAiSettings = (values) => axiosClient.put('/ai/settings', values).then((response) => response.data.settings);

export const saveAiKey = (provider, apiKey) => axiosClient.put(`/ai/keys/${provider}`, { apiKey }, { timeout: 30000 }).then((response) => response.data.keys);

export const removeAiKey = (provider) => axiosClient.delete(`/ai/keys/${provider}`).then((response) => response.data.keys);

// ---------------------------------------------------------------- Platform → AI (platform owner)
export const getPlatformAi = () => axiosClient.get('/platform/ai').then((response) => response.data);

export const savePlatformAiKey = (provider, apiKey) => axiosClient.put(`/platform/ai/keys/${provider}`, { apiKey }, { timeout: 30000 }).then((response) => response.data.keys);

export const removePlatformAiKey = (provider) => axiosClient.delete(`/platform/ai/keys/${provider}`).then((response) => response.data.keys);

export const setOrganizationAiAccess = (organizationId, aiAccess) =>
  axiosClient.patch(`/platform/organizations/${organizationId}/ai`, { aiAccess }).then((response) => response.data);

// ---------------------------------------------------------------- the marketing agent: Brand Kit, research, weekly plans
export const getBrandKit = () => axiosClient.get('/ai/brand-kit').then((response) => response.data.brandKit);

export const saveBrandKit = (values) => axiosClient.put('/ai/brand-kit', values).then((response) => response.data.brandKit);

/** Suggested Brand Kit fields read from a website (not saved until the person saves the form). */
export const brandKitFromWebsite = (url) => axiosClient.post('/ai/brand-kit/from-website', { url }, { timeout: AI_TIMEOUT_MS }).then((response) => response.data);

export const getResearchReports = () => axiosClient.get('/ai/research').then((response) => response.data.reports);

export const getResearchReport = (id) => axiosClient.get(`/ai/research/${id}`).then((response) => response.data.report);

export const startResearch = () => axiosClient.post('/ai/research', {}).then((response) => response.data.report);

export const getContentPlans = () => axiosClient.get('/ai/plans').then((response) => response.data.plans);

export const getContentPlan = (id) => axiosClient.get(`/ai/plans/${id}`).then((response) => response.data.plan);

export const createContentPlan = (values) => axiosClient.post('/ai/plans', values).then((response) => response.data.plan);
