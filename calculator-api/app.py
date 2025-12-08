from flask import Flask, request, jsonify
from flask_cors import CORS
import re

app = Flask(__name__)
CORS(app)

@app.route('/api/calculate', methods=['POST'])
def calculate():
    """
    Calculate a mathematical expression
    Expected JSON: {"expression": "2+2*3"}
    """
    try:
        data = request.get_json()
        
        if not data or 'expression' not in data:
            return jsonify({'error': 'Missing expression'}), 400
        
        expression = data['expression'].strip()
        
        # Validate expression - only allow numbers, operators, and parentheses
        if not re.match(r'^[\d+\-*/().\s]+$', expression):
            return jsonify({'error': 'Invalid characters in expression'}), 400
        
        # Prevent code injection
        if any(keyword in expression for keyword in ['import', '__', 'eval', 'exec']):
            return jsonify({'error': 'Invalid expression'}), 400
        
        try:
            result = eval(expression)
            return jsonify({
                'expression': expression,
                'result': result
            }), 200
        except ZeroDivisionError:
            return jsonify({'error': 'Division by zero'}), 400
        except Exception as e:
            return jsonify({'error': f'Invalid expression: {str(e)}'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'UP',
        'service': 'Calculator API'
    }), 200

@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        'message': 'Calculator API',
        'version': '1.0.0',
        'endpoints': {
            'calculate': 'POST /api/calculate with {"expression": "..."}',
            'health': 'GET /api/health'
        }
    }), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
