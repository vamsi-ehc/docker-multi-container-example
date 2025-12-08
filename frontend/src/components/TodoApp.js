import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { apiClient } from '../config/api';
import './TodoApp.css';

function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(apiClient.todos.getAll());
      const data = Array.isArray(response.data) ? response.data : [];
      setTodos(data);
    } catch (err) {
      console.error('Error fetching todos:', err);
      setError('Failed to load todos. Make sure the backend is running on port 3000.');
      setTodos([]);
    }
    setLoading(false);
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const response = await axios.post(apiClient.todos.create(), { task: input });
      if (response.data && response.data._id) {
        setTodos([...todos, response.data]);
        setInput('');
        setError('');
      }
    } catch (err) {
      console.error('Error adding todo:', err);
      setError('Failed to add todo');
    }
  };

  const deleteTodo = async (id) => {
    try {
      await axios.delete(apiClient.todos.delete(id));
      setTodos(todos.filter(todo => todo._id !== id));
      setError('');
    } catch (err) {
      console.error('Error deleting todo:', err);
      setError('Failed to delete todo');
    }
  };

  return (
    <div className="todo-app">
      <div className="todo-container">
        <h1>📝 Todo List</h1>
        
        {error && <div className="error-banner">{error}</div>}
        
        <form onSubmit={addTodo} className="todo-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a new task..."
            className="todo-input"
            disabled={loading}
          />
          <button type="submit" className="todo-btn" disabled={loading}>
            {loading ? 'Loading...' : 'Add Task'}
          </button>
        </form>

        {loading ? (
          <p className="loading">Loading...</p>
        ) : (
          <ul className="todo-list">
            {(Array.isArray(todos) ? todos : []).map((todo) => (
              <li key={todo._id} className="todo-item">
                <span className="todo-text">{todo.task}</span>
                <button
                  onClick={() => deleteTodo(todo._id)}
                  className="delete-btn"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {todos.length === 0 && !loading && (
          <p className="empty-state">No todos yet. Add one to get started!</p>
        )}
      </div>
    </div>
  );
}

export default TodoApp;
