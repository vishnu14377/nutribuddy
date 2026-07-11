import React, { useContext, useState, useRef, useEffect } from 'react'
import './Navbar.css'
import { assets } from '../../assets/assets'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import api from '../../services/api.js'

const Navbar = ({ setShowLogin }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef(null);
  const navRef = useRef(null);
  const { cartItems, token, logout, user } = useContext(StoreContext);
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = Object.values(cartItems).reduce((total, quantity) => total + Math.max(0, quantity), 0);

  const isPathActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const closeMenus = () => {
    setMobileOpen(false);
    setShowSearch(false);
    setSuggestions([]);
  };

  const goToHomeSection = (sectionId) => {
    const hash = `#${sectionId}`;
    closeMenus();
    if (location.pathname !== '/' || location.hash !== hash) {
      navigate(`/${hash}`);
      setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 80);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Debounced search suggestions
  useEffect(() => {
    if (searchQuery.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/search/suggestions?q=${searchQuery}`);
        setSuggestions(res.data.data || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!searchRef.current?.contains(e.target)) {
        setSuggestions([]);
        setShowSearch(false);
      }
      if (!navRef.current?.contains(e.target)) setMobileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    closeMenus();
  }, [location.pathname, location.hash]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSuggestions([]);
      setShowSearch(false);
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };
  const portalLabel =
    user?.role === 'admin' ? 'Admin Panel' :
    user?.role === 'restaurant_owner' ? 'Owner Portal' :
    user?.role === 'delivery_partner' ? 'Delivery Portal' : null;

  return (
    <header className='navbar' ref={navRef}>
      <Link to='/' className='brand-link' aria-label="BiteRush home" onClick={closeMenus}>
        <span className='brand-mark'>B</span>
        <span className='brand-name'>BiteRush</span>
      </Link>

      <nav className="navbar-menu" aria-label="Primary navigation">
        <Link to="/" onClick={closeMenus} className={isPathActive('/') ? "active" : ""}>Home</Link>
        <Link to="/restaurants" onClick={closeMenus} className={isPathActive('/restaurants') || isPathActive('/restaurant') ? "active" : ""}>Restaurants</Link>
        <button onClick={() => goToHomeSection('explore-menu')} className={location.hash === "#explore-menu" ? "active" : ""}>Menu</button>
        <button onClick={() => goToHomeSection('footer')} className={location.hash === "#footer" ? "active" : ""}>Contact</button>
      </nav>

      <div className="navbar-right">
        {/* Search */}
        <div className="navbar-search-wrap" ref={searchRef}>
          <button className="icon-btn" onClick={() => setShowSearch(s => !s)} aria-label="Search">
            <img src={assets.search_icon} alt="search" />
          </button>
          {showSearch && (
            <form className="navbar-search-form" onSubmit={handleSearch}>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search food or restaurants..."
              />
              {suggestions.length > 0 && (
                <ul className="search-suggestions">
                  {suggestions.map((s, i) => (
                    <li key={i} onClick={() => { setSearchQuery(s.label); navigate(`/search?q=${encodeURIComponent(s.label)}`); setSuggestions([]); setShowSearch(false); }}>
                      <span className={`suggestion-tag ${s.type}`}>{s.type}</span>
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}
        </div>

        {/* Cart */}
        <Link to='/cart' className='navbar-cart-icon' onClick={closeMenus} aria-label={`Cart with ${cartCount} items`}>
          <img src={assets.basket_icon} alt="cart" />
          {cartCount > 0 && <span className="cart-count">{cartCount > 99 ? '99+' : cartCount}</span>}
        </Link>

        {/* Auth */}
        {!token
          ? <button className="signin-btn" onClick={() => { closeMenus(); setShowLogin(true); }}>Sign In</button>
          : <div className='navbar-profile'>
              <img src={user?.avatar || assets.profile_icon} alt="profile" />
              <ul className='navbar-profile-dropdown'>
                <li onClick={() => navigate('/profile')}>
                  <img src={assets.profile_icon} alt="" /><p>Profile</p>
                </li>
                <li onClick={() => navigate('/myorders')}>
                  <img src={assets.bag_icon} alt="" /><p>My Orders</p>
                </li>
                {portalLabel && (
                  <li onClick={() => window.open('http://localhost:5174', '_blank')}>
                    <img src={assets.profile_icon} alt="" /><p>{portalLabel}</p>
                  </li>
                )}
                <hr />
                <li onClick={handleLogout}>
                  <img src={assets.logout_icon} alt="" /><p>Logout</p>
                </li>
              </ul>
            </div>
        }

        <button
          className={`mobile-menu-toggle ${mobileOpen ? 'open' : ''}`}
          onClick={() => setMobileOpen(open => !open)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <nav className={`mobile-menu ${mobileOpen ? 'open' : ''}`} aria-label="Mobile navigation">
        <Link to="/" onClick={closeMenus} className={isPathActive('/') ? "active" : ""}>Home</Link>
        <Link to="/restaurants" onClick={closeMenus} className={isPathActive('/restaurants') || isPathActive('/restaurant') ? "active" : ""}>Restaurants</Link>
        <button onClick={() => goToHomeSection('explore-menu')} className={location.hash === "#explore-menu" ? "active" : ""}>Menu</button>
        <button onClick={() => goToHomeSection('footer')} className={location.hash === "#footer" ? "active" : ""}>Contact</button>
      </nav>
    </header>
  )
}

export default Navbar
