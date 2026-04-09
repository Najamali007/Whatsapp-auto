type LoadingListener = (isLoading: boolean, progress: number, message: string, isError: boolean) => void;

class LoadingManager {
  private listeners: LoadingListener[] = [];
  private isLoading = false;
  private progress = 0;
  private message = 'Please wait...';
  private isError = false;

  subscribe(listener: LoadingListener) {
    this.listeners.push(listener);
    listener(this.isLoading, this.progress, this.message, this.isError);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  setLoading(isLoading: boolean, message = 'Please wait...', isError = false) {
    this.isLoading = isLoading;
    this.message = message;
    this.isError = isError;
    if (!isLoading) {
      this.progress = 0;
      this.isError = false;
    }
    this.notify();
  }

  setProgress(progress: number) {
    this.progress = progress;
    this.notify();
  }

  setError(message: string) {
    this.isLoading = true;
    this.message = message;
    this.isError = true;
    this.progress = 100;
    this.notify();
  }

  private notify() {
    this.listeners.forEach(l => l(this.isLoading, this.progress, this.message, this.isError));
  }
}

export const loadingManager = new LoadingManager();
