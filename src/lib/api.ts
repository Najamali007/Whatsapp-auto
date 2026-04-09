import { loadingManager } from './loading';

async function _apiFetch(url: string, options: RequestInit = {}, onLogout?: () => void) {
  const token = localStorage.getItem('token');
  
  if (!token || token === 'null' || token === 'undefined') {
    localStorage.removeItem('token');
    if (onLogout) {
      onLogout();
    } else {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized: No token found');
  }

  const headers: any = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const response = await fetch(fullUrl, { ...options, headers }).catch(err => {
      console.error(`Fetch execution error for ${fullUrl}:`, err);
      throw err;
    });
    
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token');
      if (onLogout) {
        onLogout();
      } else {
        window.location.reload();
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
      
      if (errorMessage === 'The API token has been reached. Kindly update your API.') {
        loadingManager.setError(errorMessage);
      }
      
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      throw error;
    }
    console.error(`API Fetch Error (${url}):`, error);
    throw error;
  }
}

export async function apiFetch(url: string, options: RequestInit & { heavy?: boolean } = {}, onLogout?: () => void) {
  if (options.heavy) {
    loadingManager.setLoading(true, 'Processing heavy request...');
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 10, 95);
      loadingManager.setProgress(Math.round(progress));
    }, 500);
    
    try {
      const res = await _apiFetch(url, options, onLogout);
      loadingManager.setProgress(100);
      return res;
    } finally {
      clearInterval(interval);
      setTimeout(() => loadingManager.setLoading(false), 500);
    }
  }
  return _apiFetch(url, options, onLogout);
}
