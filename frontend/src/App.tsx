import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AdsProfiles from './pages/AdsProfiles'
import Groups from './pages/Groups'
import CustomDNS from './pages/CustomDNS'
import Logs from './pages/Logs'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ads-profiles" element={<AdsProfiles />} />
          <Route path="groups" element={<Groups />} />
          <Route path="dns" element={<CustomDNS />} />
          <Route path="logs" element={<Logs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
