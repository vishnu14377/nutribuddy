import React, { useEffect, useState, useContext } from 'react'
import './Dashboard.css'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className="stat-card" style={{ '--accent': color }}>
    <div className="stat-icon" style={{ background: color + '20', color }}>{icon}</div>
    <div className="stat-info">
      <p className="stat-label">{label}</p>
      <h3 className="stat-value">{value}</h3>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  </div>
)

const Dashboard = () => {
  const { url, token, user, socket } = useContext(AdminContext);
  const [stats, setStats]   = useState(null)
  const [chart, setChart]   = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const role = user?.role || 'admin';

  const fetchAll = async () => {
    if (!token) return;
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [sRes, cRes, oRes] = await Promise.all([
        axios.get(`${url}/api/admin/stats`, config),
        axios.get(`${url}/api/admin/revenue-chart`, config),
        axios.get(`${url}/api/order/list?limit=5`, config),
      ])
      if (sRes.data.success) setStats(sRes.data.data)
      if (cRes.data.success) setChart(cRes.data.data)
      if (oRes.data.success) setOrders(oRes.data.data)
    } catch (err) {
      console.error("Dashboard fetch error", err);
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchAll()
  }, [token, url])

  useEffect(() => {
    if (!socket) return
    socket.on('order_status_update', fetchAll)
    socket.on('driver_location', fetchAll)
    socket.on('notification', fetchAll)
    return () => {
      socket.off('order_status_update', fetchAll)
      socket.off('driver_location', fetchAll)
      socket.off('notification', fetchAll)
    }
  }, [socket, token, url])

  if (loading) return (
    <div className="dash-loading">
      <div className="spinner" />
      <p>Loading your dashboard...</p>
    </div>
  )

  const chartData = {
    labels:   chart.map(d => d.date),
    datasets: [
      {
        label:           'Revenue (₹)',
        data:            chart.map(d => d.revenue),
        borderColor:     '#ff4f00',
        backgroundColor: 'rgba(255,79,0,0.08)',
        borderWidth:     2.5,
        pointRadius:     4,
        pointBackgroundColor: '#ff4f00',
        fill:            true,
        tension:         0.4,
        yAxisID:         'y',
      },
      {
        label:           'Orders',
        data:            chart.map(d => d.orders),
        borderColor:     '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderWidth:     2,
        pointRadius:     3,
        fill:            false,
        tension:         0.4,
        yAxisID:         'y1',
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0 ? `₹${ctx.raw}` : `${ctx.raw} orders` } } },
    scales: {
      y:  { type: 'linear', position: 'left',  grid: { color: '#f0f0f0' }, ticks: { callback: v => `₹${v}` } },
      y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
      x:  { grid: { display: false } },
    },
  }

  const statusHandler = async (event, orderId) => {
    try {
      setRefreshing(true);
      const response = await axios.post(`${url}/api/order/status`, {
        orderId,
        status: event.target.value
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      if (response.data.success) {
        toast.success("Status Updated");
        // Refresh orders
        const oRes = await axios.get(`${url}/api/order/list?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
        if (oRes.data.success) setOrders(oRes.data.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally {
      setRefreshing(false);
    }
  }

  const STATUS_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'];
  const STATUS_COLORS = { Pending: '#f59e0b', Confirmed: '#3b82f6', Preparing: '#8b5cf6', Ready: '#06b6d4', 'Out for Delivery': '#ff4f00', Delivered: '#22c55e', Cancelled: '#ef4444' }

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h1>{role === 'admin' ? 'Master Admin' : 'Restaurant Dashboard'}</h1>
        <p>Welcome back! Here's your {role === 'admin' ? 'platform' : 'restaurant'} overview.</p>
      </div>

      {role === 'restaurant_owner' && stats?.setupRequired && (
        <div className="setup-notice">
          <h2>Create your restaurant first</h2>
          <p>Your owner account is active. Add your restaurant profile, then you can upload menu items.</p>
          <Link to="/add">Set Up Restaurant</Link>
        </div>
      )}

      <div className="stats-grid">
        <StatCard icon="📦" label="Total Orders" value={stats?.orders?.total || 0} sub={`+${stats?.orders?.today || 0} today`} color="#ff4f00" />
        <StatCard icon="💰" label="Total Revenue" value={`₹${(stats?.revenue?.total || 0).toLocaleString()}`} sub={`₹${stats?.revenue?.today || 0} today`} color="#22c55e" />
        
        {role === 'admin' && (
          <>
            <StatCard icon="👥" label="Total Users" value={stats?.users?.total || 0} sub={`+${stats?.users?.today || 0} new today`} color="#6366f1" />
            <StatCard icon="🏪" label="Restaurants" value={stats?.restaurants?.total || 0} sub={`${stats?.restaurants?.pending || 0} pending approval`} color="#f59e0b" />
            <StatCard icon="🚴" label="Online Drivers" value={stats?.drivers?.online || 0} sub="Currently active" color="#06b6d4" />
          </>
        )}
      </div>

      <div className="chart-section">
        <div className="chart-card large">
          <h3>📊 {role === 'admin' ? 'Global' : 'My'} Performance — Last 7 Days</h3>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="recent-orders">
        <h3>🕐 Recent {role === 'admin' ? 'Platform' : 'Restaurant'} Orders</h3>
        {orders.length === 0 ? <p className="no-data">No orders yet</p> : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                {role === 'admin' && <th>Driver</th>}
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o._id} style={{ opacity: refreshing ? 0.6 : 1 }}>
                  <td className="order-id">#{o.orderId?.slice(0,8) || o._id?.slice(-6).toUpperCase()}</td>
                  <td>
                    <div className="customer-cell">
                      <p className="cust-name">{o.userId?.name || 'N/A'}</p>
                      <p className="cust-phone">{o.address?.phone || ''}</p>
                    </div>
                  </td>
                  {role === 'admin' && (
                    <td>
                      {o.assignedDriver ? (
                        <div className="customer-cell">
                          <p className="cust-name">{o.assignedDriver.userId?.name || 'Driver assigned'}</p>
                          <p className="cust-phone">
                            {o.assignedDriver.currentLocation?.coordinates?.[1] && o.assignedDriver.currentLocation?.coordinates?.[0]
                              ? `${Number(o.assignedDriver.currentLocation.coordinates[1]).toFixed(4)}, ${Number(o.assignedDriver.currentLocation.coordinates[0]).toFixed(4)}`
                              : 'Location pending'}
                          </p>
                        </div>
                      ) : (
                        <span className="no-data">Waiting for driver</span>
                      )}
                    </td>
                  )}
                  <td className="amount">₹{o.totalAmount}</td>
                  <td>
                    {role === 'restaurant_owner' ? (
                      <select 
                        value={o.status} 
                        onChange={(e) => statusHandler(e, o._id)}
                        className={`status-dash-select ${o.status.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        {STATUS_STEPS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="status-pill" style={{ background: (STATUS_COLORS[o.status] || '#888') + '20', color: STATUS_COLORS[o.status] || '#888' }}>{o.status}</span>
                    )}
                  </td>
                  <td className="date">{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Dashboard
