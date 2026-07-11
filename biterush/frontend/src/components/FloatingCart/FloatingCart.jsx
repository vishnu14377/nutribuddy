import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { StoreContext } from '../../Context/StoreContext';
import './FloatingCart.css';

const FloatingCart = ({ setShowLogin }) => {
    const { getTotalCartAmount, currency, token } = useContext(StoreContext);
    const navigate = useNavigate();

    const totalAmount = getTotalCartAmount();

    if (totalAmount <= 0) return null;

    const handleBuyNow = () => {
        if (!token) {
            setShowLogin(true);
        } else {
            navigate('/order');
        }
    };

    return (
        <div className="floating-cart-container" onClick={handleBuyNow}>
            <div className="floating-cart-content">
                <div className="cart-total-info">
                    <span className="cart-amount">{currency}{totalAmount}</span>
                    <span className="cart-label">Items in Cart</span>
                </div>
                <div className="buy-now-btn">
                    <span>Buy Now</span>
                    <span className="arrow-right">→</span>
                </div>
            </div>
        </div>
    );
};

export default FloatingCart;
