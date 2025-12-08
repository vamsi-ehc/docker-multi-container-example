import React, { useState } from 'react';
import TodoApp from './components/TodoApp';
import Calculator from './pages/Calculator';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('todo');

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-content">
          <h2 className="nav-brand">Multi-App Platform</h2>
          <div className="nav-buttons">
            <button
              className={`nav-btn ${currentPage === 'todo' ? 'active' : ''}`}
              onClick={() => setCurrentPage('todo')}
            >
              📝 Todo
            </button>
            <button
              className={`nav-btn ${currentPage === 'calculator' ? 'active' : ''}`}
              onClick={() => setCurrentPage('calculator')}
            >
              🧮 Calculator
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {currentPage === 'todo' && <TodoApp />}
        {currentPage === 'calculator' && <Calculator />}
      </main>
    </div>
  );
}

export default App;
