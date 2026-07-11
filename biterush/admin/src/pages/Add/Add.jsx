import React, { useState, useEffect, useContext, useRef } from 'react'
import './Add.css'
import { assets } from '../../assets/assets';
import axios from 'axios';
import { toast } from 'react-toastify';
import { AdminContext } from '../../context/AdminContext';

const Add = () => {
    const { url, token, user } = useContext(AdminContext);
    const [image, setImage] = useState(false);
    const imageInputRef = useRef(null);
    const [restaurants, setRestaurants] = useState([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(true);
    const [restaurantData, setRestaurantData] = useState({
        name: "",
        description: "",
        cuisine: "",
        email: "",
        phone: "",
        street: "",
        city: "",
        state: "",
        pincode: ""
    });
    const [data, setData] = useState({
        name: "",
        description: "",
        price: "",
        category: "Salad",
        restaurantId: "",
        preparationTime: 20
    });

    const role = user?.role || 'admin';

    const fetchRestaurants = async () => {
        setRestaurantsLoading(true);
        try {
            const endpoint = role === 'admin' ? '/api/restaurants' : '/api/restaurant/my';
            const response = await axios.get(`${url}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success) {
                setRestaurants(response.data.data);
                if (response.data.data.length > 0) {
                    setData(prev => ({ ...prev, restaurantId: response.data.data[0]._id }));
                }
            }
        } catch (error) {
            toast.error("Failed to load restaurants");
        } finally {
            setRestaurantsLoading(false);
        }
    }

    useEffect(() => {
        if (token) fetchRestaurants();
    }, [token, role]);

    const onSubmitHandler = async (event) => {
        event.preventDefault();

        if (!image) {
            toast.error('Image not selected');
            return null;
        }

        if (!data.restaurantId) {
            toast.error('Please select a restaurant');
            return null;
        }

        const formData = new FormData();
        formData.append("name", data.name);
        formData.append("description", data.description);
        formData.append("price", Number(data.price));
        formData.append("category", data.category);
        formData.append("restaurantId", data.restaurantId);
        formData.append("preparationTime", data.preparationTime);
        formData.append("image", image);

        try {
            const response = await axios.post(`${url}/api/food/add`, formData, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success) {
                toast.success(response.data.message)
                setData({
                    ...data,
                    name: "",
                    description: "",
                    price: "",
                    preparationTime: 20
                })
                setImage(false);
            } else {
                toast.error(response.data.message)
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "An error occurred while adding food")
        }
    }

    const onChangeHandler = (event) => {
        const name = event.target.name;
        const value = event.target.value;
        setData(data => ({ ...data, [name]: value }))
    }

    const onRestaurantChange = (event) => {
        const name = event.target.name;
        const value = event.target.value;
        setRestaurantData(data => ({ ...data, [name]: value }))
    }

    const onRestaurantSubmit = async (event) => {
        event.preventDefault();
        try {
            const payload = {
                name: restaurantData.name,
                description: restaurantData.description,
                cuisine: restaurantData.cuisine.split(',').map(item => item.trim()).filter(Boolean),
                email: restaurantData.email,
                phone: restaurantData.phone,
                address: {
                    street: restaurantData.street,
                    city: restaurantData.city,
                    state: restaurantData.state,
                    pincode: restaurantData.pincode
                }
            };
            const response = await axios.post(`${url}/api/restaurant/register`, payload, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success) {
                toast.success(response.data.message || 'Restaurant registered');
                await fetchRestaurants();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not register restaurant");
        }
    }

    if (role === 'restaurant_owner' && restaurantsLoading) {
        return (
            <div className='add-page'>
                <div className="add-header">
                    <h2>Checking Restaurant Setup</h2>
                    <p>Loading your owner profile...</p>
                </div>
            </div>
        )
    }

    if (role === 'restaurant_owner' && restaurants.length === 0) {
        return (
            <div className='add-page'>
                <div className="add-header">
                    <h2>Create Your Restaurant</h2>
                    <p>Set up your restaurant profile first. After that, this page becomes your menu uploader.</p>
                </div>

                <form className='restaurant-setup-form' onSubmit={onRestaurantSubmit}>
                    <div className="form-group">
                        <p>Restaurant Name</p>
                        <input name='name' onChange={onRestaurantChange} value={restaurantData.name} type="text" placeholder='e.g. BiteRush Kitchen' required />
                    </div>
                    <div className="form-group">
                        <p>Description</p>
                        <textarea name='description' onChange={onRestaurantChange} value={restaurantData.description} rows={3} placeholder='Tell customers what you serve...' required />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <p>Cuisine</p>
                            <input name='cuisine' onChange={onRestaurantChange} value={restaurantData.cuisine} type="text" placeholder='Indian, Chinese, Fast Food' required />
                        </div>
                        <div className="form-group">
                            <p>Phone</p>
                            <input name='phone' onChange={onRestaurantChange} value={restaurantData.phone} type="tel" placeholder='Restaurant phone' required />
                        </div>
                    </div>
                    <div className="form-group">
                        <p>Email</p>
                        <input name='email' onChange={onRestaurantChange} value={restaurantData.email} type="email" placeholder='restaurant@example.com' required />
                    </div>
                    <div className="form-group">
                        <p>Street Address</p>
                        <input name='street' onChange={onRestaurantChange} value={restaurantData.street} type="text" placeholder='Street and area' required />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <p>City</p>
                            <input name='city' onChange={onRestaurantChange} value={restaurantData.city} type="text" placeholder='City' required />
                        </div>
                        <div className="form-group">
                            <p>State</p>
                            <input name='state' onChange={onRestaurantChange} value={restaurantData.state} type="text" placeholder='State' required />
                        </div>
                    </div>
                    <div className="form-group">
                        <p>Pincode</p>
                        <input name='pincode' onChange={onRestaurantChange} value={restaurantData.pincode} type="text" placeholder='Pincode' required />
                    </div>
                    <button type='submit' className='submit-btn'>Create Restaurant</button>
                </form>
            </div>
        )
    }

    return (
        <div className='add-page'>
            <div className="add-header">
                <h2>➕ {role === 'admin' ? 'Add New Menu Item' : 'Add Food to My Kitchen'}</h2>
                <p>{role === 'admin' ? 'Create a food item and assign it to a restaurant' : 'Manage your restaurant menu items'}</p>
            </div>
            
            <form className='add-form' onSubmit={onSubmitHandler}>
                <div className="add-form-left">
                    <div className='add-img-upload'>
                        <p>Upload Image</p>
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    setImage(e.target.files[0]);
                                }
                            }}
                        />
                        <div
                            onClick={() => imageInputRef.current.click()}
                            style={{
                                width: '100%',
                                maxWidth: '300px',
                                height: '200px',
                                border: '2px dashed #ccc',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                background: image ? 'transparent' : '#fafafa',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                        >
                            {image ? (
                                <img
                                    src={URL.createObjectURL(image)}
                                    alt="Preview"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <>
                                    <img
                                        src={assets.upload_area}
                                        alt="Upload"
                                        style={{ width: '80px', opacity: 0.5 }}
                                    />
                                    <span style={{ marginTop: 8, color: '#999', fontSize: 13 }}>Click to upload</span>
                                </>
                            )}
                        </div>
                        {image && (
                            <button
                                type="button"
                                onClick={() => setImage(false)}
                                style={{ marginTop: 8, fontSize: 12, color: '#ff4f00', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                ✕ Remove image
                            </button>
                        )}
                    </div>

                    <div className="form-group">
                        <p>Product Name</p>
                        <input name='name' onChange={onChangeHandler} value={data.name} type="text" placeholder='e.g. Greek Salad' required />
                    </div>

                    <div className="form-group">
                        <p>Product Description</p>
                        <textarea name='description' onChange={onChangeHandler} value={data.description} rows={4} placeholder='Describe the dish...' required />
                    </div>
                </div>

                <div className="add-form-right">
                    {role === 'admin' ? (
                        <div className="form-group">
                            <p>Target Restaurant</p>
                            <select name='restaurantId' value={data.restaurantId} onChange={onChangeHandler} required>
                                {restaurants.map(res => (
                                    <option key={res._id} value={res._id}>{res.name}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="form-group">
                            <p>My Restaurant</p>
                            <input type="text" value={restaurants[0]?.name || 'Loading...'} disabled />
                        </div>
                    )}

                    <div className="form-row">
                        <div className="form-group">
                            <p>Category</p>
                            <select name='category' value={data.category} onChange={onChangeHandler}>
                                <option value="Salad">Salad</option>
                                <option value="Rolls">Rolls</option>
                                <option value="Deserts">Deserts</option>
                                <option value="Sandwich">Sandwich</option>
                                <option value="Cake">Cake</option>
                                <option value="Pure Veg">Pure Veg</option>
                                <option value="Pasta">Pasta</option>
                                <option value="Noodles">Noodles</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <p>Price (₹)</p>
                            <input type="number" name='price' onChange={onChangeHandler} value={data.price} placeholder='149' required />
                        </div>
                    </div>

                    <div className="form-group">
                        <p>Prep Time (Minutes)</p>
                        <input type="number" name='preparationTime' onChange={onChangeHandler} value={data.preparationTime} required />
                    </div>

                    <button type='submit' className='submit-btn'>🚀 {role === 'admin' ? 'Add Product' : 'Add to Menu'}</button>
                </div>
            </form>
        </div>
    )
}

export default Add
