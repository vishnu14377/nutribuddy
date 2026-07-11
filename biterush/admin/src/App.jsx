import React, { useContext } from 'react'
import Navbar from './components/Navbar/Navbar'
import Sidebar from './components/Sidebar/Sidebar'
import { Route, Routes } from 'react-router-dom'
import Add from './pages/Add/Add'
import List from './pages/List/List'
import Orders from './pages/Orders/Orders'
import Dashboard from './pages/Dashboard/Dashboard'
import Users from './pages/Users/Users'
import Restaurants from './pages/Restaurants/Restaurants'
import Analytics from './pages/Analytics/Analytics'
import Delivery from './pages/Delivery/Delivery'
import Login from './pages/Login/Login'
import DriverDashboard from './pages/Driver/DriverDashboard'
import DriverTasks from './pages/Driver/DriverTasks'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AdminContext } from './context/AdminContext'

const App = () => {
  const { token, user } = useContext(AdminContext);

  if (!token) {
    return (
      <>
        <ToastContainer />
        <Login />
      </>
    )
  }

  const role = user?.role || 'admin';

  return (
    <div className='app'>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
      <Navbar />
      <div className="app-content">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={role === 'delivery_partner' ? <DriverDashboard /> : <Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/add" element={<Add />} />
            <Route path="/list" element={<List />} />
            <Route path="/orders" element={<Orders />} />
            
            {/* Admin Only */}
            {role === 'admin' && (
              <>
                <Route path="/users" element={<Users />} />
                <Route path="/restaurants" element={<Restaurants />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/delivery" element={<Delivery />} />
              </>
            )}

            {/* Driver Only */}
            {role === 'delivery_partner' && (
              <>
                <Route path="/driver/dashboard" element={<DriverDashboard />} />
                <Route path="/driver/tasks" element={<DriverTasks />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
