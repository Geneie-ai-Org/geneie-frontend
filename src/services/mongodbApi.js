/**
 * MongoDB API Helper Functions
 * Replaces Firestore operations with REST API calls to MongoDB backend
 */

import { getAuth } from 'firebase/auth';
import { getApiOrigin } from '../config/api.js';

const API_BASE_URL = getApiOrigin();

const getAuthToken = async () => {
  const auth = getAuth();
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken();
  }
  return null;
};

/**
 * Get all conversations for the current user
 */
export const getConversations = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.statusText}`);
  }

  const data = await response.json();
  return data.conversations || [];
};

/**
 * Create a new conversation
 */
export const createConversation = async (title = 'New Conversation') => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data.conversation;
};

/**
 * Get a specific conversation
 */
export const getConversation = async (conversationId) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data.conversation;
};

/**
 * Update a conversation
 */
export const updateConversation = async (conversationId, updates) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    throw new Error(`Failed to update conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data.success;
};

/**
 * Delete a conversation
 */
export const deleteConversation = async (conversationId) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversation/${conversationId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

/**
 * Get all messages for a conversation
 */
export const getMessages = async (conversationId) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }

  const data = await response.json();
  return data.messages || [];
};

/**
 * Create a new message
 */
export const createMessage = async (conversationId, role, text, sources = []) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role,
      text,
      sources
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create message: ${response.statusText}`);
  }

  const data = await response.json();
  return data.message;
};

/**
 * Delete a single message (authenticated conversations only).
 */
export const deleteMessage = async (conversationId, messageId) => {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      const err = new Error('Message not found');
      err.status = 404;
      throw err;
    }
    throw new Error(`Failed to delete message: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Poll conversations periodically (replaces onSnapshot)
 * TEMP: COMPLETELY DISABLED DURING DEVELOPMENT
 */
export const pollConversations = (callback, interval = 2000) => {
  // POLLING DISABLED - DO NOTHING
  console.log('[mongodbApi] pollConversations called but DISABLED during development');
  return () => {}; // Return no-op cleanup function
  /*
  let isPolling = true;

  const poll = async () => {
    if (!isPolling) return;
    try {
      const conversations = await getConversations();
      callback(conversations);
    } catch (error) {
      console.error('Error polling conversations:', error);
    }
    if (isPolling) {
      setTimeout(poll, interval);
    }
  };

  poll(); // Start immediately

  return () => {
    isPolling = false;
  };
  */
};

/**
 * Poll messages for a conversation periodically (replaces onSnapshot)
 * TEMP: COMPLETELY DISABLED DURING DEVELOPMENT
 */
export const pollMessages = (conversationId, callback, interval = 15000) => {
  // POLLING DISABLED - DO NOTHING
  console.log('[mongodbApi] pollMessages called but DISABLED during development');
  return () => {}; // Return no-op cleanup function
  /*
  let isPolling = true;

  const poll = async () => {
    if (!isPolling || !conversationId) return;
    try {
      const messages = await getMessages(conversationId);
      callback(messages);
    } catch (error) {
      console.error('Error polling messages:', error);
    }
    if (isPolling) {
      setTimeout(poll, interval);
    }
  };

  poll(); // Start immediately

  return () => {
    isPolling = false;
  };
  */
};

/**
 * Poll conversation document periodically (replaces onSnapshot for conversation doc)
 * TEMP: COMPLETELY DISABLED DURING DEVELOPMENT
 */
export const pollConversationDoc = (conversationId, callback, interval = 5000) => {
  // POLLING DISABLED - DO NOTHING
  console.log('[mongodbApi] pollConversationDoc called but DISABLED during development');
  return () => {}; // Return no-op cleanup function
  /*
  let isPolling = true;

  const poll = async () => {
    if (!isPolling || !conversationId) return;
    try {
      const conversation = await getConversation(conversationId);
      callback(conversation);
    } catch (error) {
      console.error('Error polling conversation:', error);
      callback(null);
    }
    if (isPolling) {
      setTimeout(poll, interval);
    }
  };

  poll(); // Start immediately

  return () => {
    isPolling = false;
  };
  */
};
