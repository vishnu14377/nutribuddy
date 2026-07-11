import React, { useEffect, useState, useContext, useRef } from 'react'
import './List.css'
import axios from 'axios';
import { toast } from 'react-toastify';
import { AdminContext } from '../../context/AdminContext';

const CATEGORIES = ['Salad', 'Rolls', 'Deserts', 'Sandwich', 'Cake', 'Pure Veg', 'Pasta', 'Noodles'];

const List = () => {
    const { url, token, currency, user } = useContext(AdminContext);
    const [list, setList]               = useState([]);
    const [restaurants, setRestaurants] = useState([]);
    const [selectedRes, setSelectedRes] = useState('all');
    const [loading, setLoading]         = useState(true);

    // Edit modal state
    const [editItem, setEditItem]       = useState(null); // null = closed
    const [editForm, setEditForm]       = useState({});
    const [editImage, setEditImage]     = useState(null); // new File | null
    const [saving, setSaving]           = useState(false);
    const editImageRef                  = useRef(null);

    const role = user?.role || 'admin';

    /* ── fetch restaurants ─────────────────────── */
    const fetchRestaurants = async () => {
        try {
            const endpoint = role === 'admin' ? '/api/restaurants' : '/api/restaurant/my';
            const res = await axios.get(`${url}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) {
                setRestaurants(res.data.data);
                if (role !== 'admin' && res.data.data.length > 0) {
                    setSelectedRes(res.data.data[0]._id);
                }
            }
        } catch (_) {}
    };

    /* ── fetch food list ───────────────────────── */
    const fetchList = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${url}/api/food/list`);
            if (res.data.success) setList(res.data.data);
        } catch (_) {
            toast.error('Error fetching food list');
        } finally {
            setLoading(false);
        }
    };

    /* ── delete ────────────────────────────────── */
    const removeFood = async (foodId) => {
        if (!window.confirm('Delete this item?')) return;
        try {
            const res = await axios.post(`${url}/api/food/remove`, { id: foodId }, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) { toast.success(res.data.message); fetchList(); }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove item');
        }
    };

    /* ── open edit modal ───────────────────────── */
    const openEdit = (item) => {
        setEditItem(item);
        setEditForm({
            name:            item.name,
            description:     item.description,
            price:           item.price,
            category:        item.category,
            preparationTime: item.preparationTime || 20,
        });
        setEditImage(null);
    };

    /* ── save edit ─────────────────────────────── */
    const saveEdit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('name',            editForm.name);
            formData.append('description',     editForm.description);
            formData.append('price',           editForm.price);
            formData.append('category',        editForm.category);
            formData.append('preparationTime', editForm.preparationTime);
            if (editImage) formData.append('image', editImage);

            const res = await axios.put(`${url}/api/food/${editItem._id}`, formData, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.data.success) {
                toast.success('Food item updated!');
                setEditItem(null);
                fetchList();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update item');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        fetchRestaurants();
        fetchList();
    }, []);

    const filteredList = list.filter(item =>
        selectedRes === 'all' ||
        item.restaurantId === selectedRes ||
        item.restaurantId?._id === selectedRes
    );

    return (
        <div className='list-page'>

            {/* ── Edit Modal ── */}
            {editItem && (
                <div className="edit-modal-overlay" onClick={() => setEditItem(null)}>
                    <div className="edit-modal" onClick={e => e.stopPropagation()}>
                        <div className="edit-modal-header">
                            <h3>✏️ Edit Food Item</h3>
                            <button className="modal-close-btn" onClick={() => setEditItem(null)}>✕</button>
                        </div>

                        <form className="edit-modal-form" onSubmit={saveEdit}>
                            {/* Image preview + upload */}
                            <div className="edit-img-section">
                                <div
                                    className="edit-img-preview"
                                    onClick={() => editImageRef.current.click()}
                                    title="Click to change image"
                                >
                                    <img
                                        src={editImage ? URL.createObjectURL(editImage) : `${url}/images/${editItem.image}`}
                                        alt="preview"
                                    />
                                    <div className="edit-img-overlay">🖼 Change Image</div>
                                </div>
                                <input
                                    ref={editImageRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={e => { if (e.target.files[0]) setEditImage(e.target.files[0]); }}
                                />
                                {editImage && (
                                    <button type="button" className="remove-new-img" onClick={() => setEditImage(null)}>
                                        ✕ Keep original
                                    </button>
                                )}
                            </div>

                            {/* Fields */}
                            <div className="edit-form-grid">
                                <div className="edit-field">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="edit-field">
                                    <label>Category</label>
                                    <select
                                        value={editForm.category}
                                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="edit-field">
                                    <label>Price (₹)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editForm.price}
                                        onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="edit-field">
                                    <label>Prep Time (min)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editForm.preparationTime}
                                        onChange={e => setEditForm(f => ({ ...f, preparationTime: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="edit-field edit-field--full">
                                    <label>Description</label>
                                    <textarea
                                        rows={3}
                                        value={editForm.description}
                                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="edit-modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setEditItem(null)}>Cancel</button>
                                <button type="submit" className="save-btn" disabled={saving}>
                                    {saving ? 'Saving…' : '💾 Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Page Header ── */}
            <div className="list-header">
                <div className="header-left">
                    <h2>🍕 Food Inventory</h2>
                    <p>{role === 'admin' ? 'Manage all menu items across restaurants' : 'Manage your restaurant menu items'}</p>
                </div>
                {role === 'admin' && (
                    <div className="header-right">
                        <select value={selectedRes} onChange={e => setSelectedRes(e.target.value)} className='res-filter-select'>
                            <option value="all">All Restaurants</option>
                            {restaurants.map(res => (
                                <option key={res._id} value={res._id}>{res.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ── Table ── */}
            <div className="list-container">
                <div className="list-table-header">
                    <b>Image</b>
                    <b>Name</b>
                    <b>{role === 'admin' ? 'Restaurant' : 'Status'}</b>
                    <b>Category</b>
                    <b>Price</b>
                    <b>Actions</b>
                </div>

                {loading ? (
                    <div className="list-loading">Loading items…</div>
                ) : filteredList.length === 0 ? (
                    <div className="no-data">No items found.</div>
                ) : (
                    filteredList.map((item, index) => (
                        <div key={index} className='list-table-row'>
                            <img src={`${url}/images/${item.image}`} alt={item.name} />
                            <div className="food-name-cell">
                                <p>{item.name}</p>
                                <span className="prep-time">⏱️ {item.preparationTime || 20} min</span>
                            </div>
                            {role === 'admin' ? (
                                <p className='res-name-badge'>{item.restaurantId?.name || 'Unknown'}</p>
                            ) : (
                                <p className={item.isAvailable ? 'status-active' : 'status-inactive'}>
                                    {item.isAvailable ? '🟢 Available' : '🔴 Out of Stock'}
                                </p>
                            )}
                            <p>{item.category}</p>
                            <p className='item-price'>{currency}{item.price}</p>
                            <div className="action-btns">
                                <button
                                    className='edit-btn'
                                    onClick={() => openEdit(item)}
                                    title='Edit Item'
                                >
                                    ✏️
                                </button>
                                <button
                                    className='delete-btn'
                                    onClick={() => removeFood(item._id)}
                                    title='Delete Item'
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default List;
