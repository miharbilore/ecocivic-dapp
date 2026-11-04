import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import App from './App.jsx'
import './index.css'
import { WalletProvider } from './context/WalletContext'

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#4caf50', // Eco green
        },
        secondary: {
            main: '#2196f3', // Water blue
        },
    },
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <WalletProvider>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </WalletProvider>
        </ThemeProvider>
    </React.StrictMode>,
)