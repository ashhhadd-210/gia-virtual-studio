import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './Context/AuthContext.jsx';
  <AuthProvider><App /></AuthProvider>
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(

      <AuthProvider>
  <BrowserRouter>
      <App />
    </BrowserRouter>
      </AuthProvider>

)