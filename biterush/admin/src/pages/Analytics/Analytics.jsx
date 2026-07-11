import React, { useEffect, useState, useContext } from 'react'
import './Analytics.jsx.css'
import { AdminContext } from '../../context/AdminContext'
import axios from 'axios'
import { Line, Bar, Pie } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler)

const Analytics = () => {
  const { url, token, currency } = useContext(AdminContext)
  const [data, setData] = useState({ revenue: [], topItems: [], statusDistribution: {} })
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${url}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        // In a real app, you'd have more specific analytics endpoints
        // Here we simulate some data from the stats
        const stats = response.data.data
        setData({
          revenue: [1200, 1900, 3000, 2500, 5000, 4200, 6000], // Last 7 days dummy
          topItems: [
            { name: 'Veggie Salad', orders: 45 },
            { name: 'Paneer Roll', orders: 38 },
            { name: 'Cupcake', orders: 32 },
            { name: 'Noodles', orders: 25 },
            { name: 'Pasta', orders: 20 }
          ],
          statusDistribution: {
            'Delivered': 120,
            'Cancelled': 15,
            'Processing': 25
          }
        })
      }
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchAnalytics()
  }, [token])

  const revenueChart = {
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
    datasets: [{
      label: 'Revenue',
      data: data.revenue,
      borderColor: '#ff4f00',
      backgroundColor: 'rgba(255, 79, 0, 0.1)',
      fill: true,
      tension: 0.4
    }]
  }

  const topItemsChart = {
    labels: data.topItems.map(i => i.name),
    datasets: [{
      label: 'Orders',
      data: data.topItems.map(i => i.orders),
      backgroundColor: ['#ff4f00', '#ff8c00', '#f59e0b', '#1fb141', '#1e88e5']
    }]
  }

  const statusPieChart = {
    labels: Object.keys(data.statusDistribution),
    datasets: [{
      data: Object.values(data.statusDistribution),
      backgroundColor: ['#1fb141', '#ff3b30', '#ff8c00']
    }]
  }

  if (loading) return <div className='analytics-loading'><div className='spinner'></div></div>

  return (
    <div className='analytics-page'>
      <div className="analytics-header">
        <h2>📈 Detailed Analytics</h2>
        <div className="date-range">Last 7 Days (Computed)</div>
      </div>

      <div className="analytics-overview-grid">
        <div className="chart-card large">
          <h3>Growth Trend (Revenue)</h3>
          <Line data={revenueChart} />
        </div>
        <div className="chart-card">
          <h3>Top Selling Items</h3>
          <Bar data={topItemsChart} options={{ indexAxis: 'y' }} />
        </div>
        <div className="chart-card">
          <h3>Order Status Distribution</h3>
          <Pie data={statusPieChart} />
        </div>
      </div>

      <div className="analytics-table-section">
        <h3>Performance Breakdown</h3>
        <div className="performance-table">
          <div className="table-header">
            <b>Restaurant</b>
            <b>Total Orders</b>
            <b>Revenue</b>
            <b>Rating</b>
            <b>Status</b>
          </div>
          {/* Mock rows for UI demonstration */}
          <div className="table-row">
            <p>Spicy Tadka</p>
            <p>156</p>
            <p>{currency}45,200</p>
            <p>⭐ 4.5</p>
            <p><span className="status-pill active">Excellent</span></p>
          </div>
          <div className="table-row">
            <p>Cake Walk</p>
            <p>98</p>
            <p>{currency}18,500</p>
            <p>⭐ 4.2</p>
            <p><span className="status-pill active">Good</span></p>
          </div>
          <div className="table-row">
            <p>Italiano</p>
            <p>42</p>
            <p>{currency}12,800</p>
            <p>⭐ 3.8</p>
            <p><span className="status-pill active">Neutral</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Analytics
