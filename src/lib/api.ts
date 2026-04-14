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

  const maxRetries = 5;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const fullUrl = url;
      console.log(`[apiFetch] Fetching ${fullUrl}... (Attempt ${i + 1})`);
      const response = await fetch(fullUrl, { ...options, headers });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user_role');
        window.dispatchEvent(new CustomEvent('unauthorized'));
        if (onLogout) {
          onLogout();
        } else {
          // Fallback if no onLogout provided
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        throw new Error('Unauthorized');
      }

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        if (isJson) {
          const errorData = await response.json().catch(() => ({}));
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text().catch(() => '');
          console.warn(`[apiFetch] Non-JSON error response from ${url}:`, text.substring(0, 100));
        }
        
        if (errorMessage === 'The API token has been reached. Kindly update your API.') {
          loadingManager.setError(errorMessage);
        }
        
        throw new Error(errorMessage);
      }

      if (isJson) {
        return await response.json();
      } else {
        const text = await response.text();
        console.warn(`[apiFetch] Expected JSON but got ${contentType} from ${url}`);
        if (text.trim().startsWith('<!doctype html>') || text.trim().startsWith('<html>')) {
          throw new Error(`Server returned HTML instead of JSON for ${url}. This usually means the route was not found.`);
        }
        return text;
      }
    } catch (error: any) {
      lastError = error;
      if (error.message === 'Unauthorized') throw error;
      
      console.error(`Fetch attempt ${i + 1} failed for ${url}:`, error);
      if (i < maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 8s, 16s
        const delay = Math.pow(2, i + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
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
