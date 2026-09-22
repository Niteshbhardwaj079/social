import { mockRequest } from '../mock/mockRequest';
import activityLogsMockData from '../mock/activityLogsMock';
import { mapActivityLogEntry } from '../../config/activityLogActionMap';
import { API_ENABLED } from '../../config/runtime';
import axiosClient from './axiosClient';

let activityLogsStore = [...activityLogsMockData];

export function getActivityLogs() {
  if (API_ENABLED) {
    return axiosClient.get('/activity-logs').then((response) => response.data.activity.map(mapActivityLogEntry));
  }
  return mockRequest([...activityLogsStore]);
}

export function deleteActivityLogs(logIds) {
  if (API_ENABLED) return axiosClient.delete('/activity-logs', { data: { ids: logIds.map(Number) } }).then((response) => response.data);
  const idsToRemove = new Set(logIds);
  activityLogsStore = activityLogsStore.filter((log) => !idsToRemove.has(log.id));
  return mockRequest({ success: true });
}
