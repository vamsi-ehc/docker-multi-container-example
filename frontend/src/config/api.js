// API configuration for both local development and Docker environments
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export const apiClient = {
  baseURL: API_BASE_URL,
  
  // Todo endpoints
  todos: {
    getAll: () => `${API_BASE_URL}/api/todos`,
    create: () => `${API_BASE_URL}/api/todos`,
    delete: (id) => `${API_BASE_URL}/api/todos/${id}`,
  },
  
  // Calculator endpoint
  calculator: {
    calculate: () => `${API_BASE_URL}/api/calculate`,
  },
  
  // Health endpoint
  health: () => `${API_BASE_URL}/api/health`,
};

export default API_BASE_URL;
