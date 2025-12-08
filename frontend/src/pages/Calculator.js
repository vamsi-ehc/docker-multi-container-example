import React, { useState } from 'react';
import axios from 'axios';
import { apiClient } from '../config/api';
import './Calculator.css';

function Calculator() {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const handleInput = (value) => {
    setExpression(expression + value);
    setError('');
  };

  const handleCalculate = async () => {
    if (!expression.trim()) {
      setError('Please enter an expression');
      return;
    }

    try {
      const response = await axios.post(apiClient.calculator.calculate(), {
        expression: expression
      });
      setResult(response.data.result);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Calculation error');
      setResult('');
    }
  };

  const handleClear = () => {
    setExpression('');
    setResult('');
    setError('');
  };

  const buttons = [
    ['7', '8', '9', '/'],
    ['4', '5', '6', '*'],
    ['1', '2', '3', '-'],
    ['0', '.', '=', '+']
  ];

  return (
    <div className="calculator-page">
      <div className="calculator-container">
        <h1>🧮 Calculator</h1>
        
        <div className="calculator">
          <div className="display">
            <div className="expression">{expression}</div>
            {result && <div className="result">= {result}</div>}
            {error && <div className="error">{error}</div>}
          </div>

          <div className="buttons-grid">
            {buttons.map((row, rowIndex) => (
              <div key={rowIndex} className="button-row">
                {row.map((btn) => (
                  <button
                    key={btn}
                    className={`calc-btn ${btn === '=' ? 'equals' : ''}`}
                    onClick={() => {
                      if (btn === '=') {
                        handleCalculate();
                      } else {
                        handleInput(btn);
                      }
                    }}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="calc-actions">
            <button className="clear-btn" onClick={handleClear}>Clear</button>
            <button className="delete-btn" onClick={() => setExpression(expression.slice(0, -1))}>Backspace</button>
          </div>
        </div>

        <div className="calc-info">
          <p>💡 Tip: Type your expression and click = or press Enter to calculate</p>
        </div>
      </div>
    </div>
  );
}

export default Calculator;
