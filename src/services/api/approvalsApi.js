import { mockRequest } from '../mock/mockRequest';
import approvalsMockData from '../mock/approvalsMock';
import { APPROVAL_STATUS } from '../../config/constants';
import { API_ENABLED } from '../../config/runtime';
import axiosClient, { apiErrorMessage } from './axiosClient';

let approvalsStore = [...approvalsMockData];

/**
 * The API's approval flow is simpler than this page's original model: a post is either waiting
 * (`pendingApproval`), was turned down (`rejected`, with a reason and free to fix and resubmit), or —
 * once approved — is just a normal scheduled/published post, tracked from the Posts list instead. So in
 * API mode this page only ever shows the first two; "Under review" and "Approved" here read 0.
 */
function present(post) {
  return {
    id: post.id,
    postContent: post.content,
    platforms: post.platforms,
    submittedBy: post.createdBy,
    submittedAt: post.updatedAt || post.createdAt,
    status: post.status === 'pendingApproval' ? APPROVAL_STATUS.SUBMITTED : APPROVAL_STATUS.REJECTED,
    comments: post.rejectionReason ? [{ id: `${post.id}-reason`, author: 'Reviewer', text: post.rejectionReason, time: post.updatedAt }] : [],
  };
}

export function getApprovals() {
  if (API_ENABLED) {
    return axiosClient
      .get('/posts')
      .then((response) => response.data.posts.filter((post) => post.status === 'pendingApproval' || post.status === 'rejected').map(present));
  }
  return mockRequest([...approvalsStore]);
}

export function approveRequest(approvalId) {
  if (API_ENABLED) {
    return axiosClient.post(`/posts/${approvalId}/approve`).then(
      () => ({ success: true }),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  approvalsStore = approvalsStore.map((approval) =>
    approval.id === approvalId ? { ...approval, status: APPROVAL_STATUS.APPROVED } : approval
  );
  return mockRequest({ success: true });
}

export function rejectRequest(approvalId, reason) {
  if (API_ENABLED) {
    return axiosClient.post(`/posts/${approvalId}/reject`, { reason }).then(
      () => ({ success: true }),
      (error) => {
        throw new Error(apiErrorMessage(error));
      }
    );
  }
  approvalsStore = approvalsStore.map((approval) =>
    approval.id === approvalId
      ? {
          ...approval,
          status: APPROVAL_STATUS.REJECTED,
          comments: [
            ...approval.comments,
            { id: `c-${Date.now()}`, author: 'Nitesh Bhardwaj', text: reason, time: new Date().toISOString() },
          ],
        }
      : approval
  );
  return mockRequest({ success: true });
}
