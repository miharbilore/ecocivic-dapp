import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Box, Container, Typography } from '@mui/material'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Water from './pages/Water'
import Recycling from './pages/Recycling'
import AdminPortal from './pages/AdminPortal'

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <Container maxWidth="xl" component="main" sx={{ flexGrow: 1, py: 4 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/water" element={<Water />} />
          <Route path="/recycling" element={<Recycling />} />
          <Route path="/admin" element={<AdminPortal />} />
        </Routes>
      </Container>
      <Box
        component="footer"
        sx={{
          py: 2,
          px: 3,
          mt: 'auto',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center'
        }}
      >
        <Typography variant="caption" color="text.secondary">
          EcoCivic B2G SaaS & TÜBİTAK 2209-B — Akıllı Şehirlerde Hibrit Güven Modeli: Oyun Teorisi ve Yapay Zeka Destekli Otonom Denetim
        </Typography>
      </Box>
    </Box>
  )
}

export default App
