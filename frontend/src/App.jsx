import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import RegistrationPage from './pages/RegistrationPage'
import FloorSelectorPage from './pages/FloorSelectorPage'
import SeatMapPage from './pages/SeatMapPage'
import MyBookingPage from './pages/MyBookingPage'
import Navbar from './components/Navbar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/" replace />
}

const Layout = ({ children }) => (
  <div className="min-h-screen bg-surface-950 font-body">
    <Navbar />
    <main>{children}</main>
  </div>
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RegistrationPage />} />
            <Route
              path="/floors"
              element={
                <PrivateRoute>
                  <Layout><FloorSelectorPage /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/floors/:floorId/seats"
              element={
                <PrivateRoute>
                  <Layout><SeatMapPage /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/my-booking"
              element={
                <PrivateRoute>
                  <Layout><MyBookingPage /></Layout>
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
