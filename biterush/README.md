# BiteRush - Complete Food Delivery Platform

BiteRush is a robust, multi-tenant food delivery application that links hungry customers, local restaurants, and delivery drivers using real-time sync and dynamic route management. The platform features strict data isolation, role-based access control, and specialized dashboards to ensure a seamless experience for all parties involved exactly when they need it.

## 🚀 Key Features

*   **Multi-Portal Architecture:** Dedicated interfaces tailored for Customers, Restaurant Owners, Delivery Partners, and System Administrators.
*   **Role-Based Access Control (RBAC):** Ensures data isolation so restaurants only manage their own menus/orders, while delivery partners focus entirely on assigned auto-dispatch task lists.
*   **Real-time Order Tracking & Dispatch:** Live tracking of delivery progress via maps, backed by Websockets (`Socket.io`) and ETA calculation services.
*   **Cross-Gateway Payments:** Support for secure checkouts with multi-gateway payments including `Stripe` and `Razorpay`.
*   **Advanced Analytics:** Interactive visualized analytics utilizing `Chart.js` for owners and admins to observe sales and performance.
*   **Rate Limiting & Security:** Integrated robust API security implementations like caching with Redis, Rate limiters, and Helmet.

---

## 🛠️ Technology Stack

### ✨ Frontend (Customer App & Admin/Partner Portals)
*   **Core:** React 18 compiled with Vite
*   **Routing:** React Router v6
*   **State & Fetching:** Axios
*   **Real-Time & Maps:** Socket.io-client, Leaflet (React-Leaflet)
*   **UI/Data Viz:** React-Toastify, Chart.js (React-chartjs-2), Vanilla CSS

### ⚙️ Backend Server (REST API)
*   **Core Framework:** Node.js, Express.js (ES6 Modules)
*   **Database Integration:** Mongoose ODM
*   **Security & Auth:** JSON Web Tokens (JWT), Bcrypt (Hashing), Helmet, Express Rate Limit, Express-Validator
*   **Real-Time Layer:** Socket.io, Redis (`ioredis`)
*   **Payments:** Stripe SDK, Razorpay SDK
*   **File Uploads:** Multer
*   **Logging & Monitoring:** Winston, Morgan

---

## 🗄️ Database Architecture (MongoDB)

The application uses **MongoDB** as its primary data store, leveraging a well-structured set of schemas to handle high transaction volumes and ensure tenant encapsulation.

### Core Models:
1.  **Users (`userModel`)**: Handles authentication properties, customized settings, and order history for customer accounts.
2.  **Restaurants (`restaurantModel`)**: Represents independent merchant entities, linking their location logic, configuration, and owner permissions.
3.  **Foods (`foodModel`)**: Represents menu items heavily bound to `restaurantModel` to achieve the necessary Multi-tenant Data isolation.
4.  **Orders (`orderModel`)**: Connects Customers, Foods, Restaurants, and Delivery Partners while providing comprehensive state-tracking across the transaction workflow.
5.  **Delivery Partners (`deliveryPartnerModel`)**: Records the driver information, current map coordinates, operational status, and automated dispatch history.

---

## 📁 System Structure

```text
tomato/
├── admin/                     # Vite + React portal for Restaurant Owners & Deliverers
│   ├── src/                   # Components, Pages, Admin routing
│   └── package.json           # Admin UI dependencies
├── frontend/                  # Vite + React portal for Customers (Menu, Checkout, Tracking)
│   ├── src/                   # Main Consumer UI pieces
│   └── package.json           # Frontend dependencies 
├── backend/                   # Express.js REST API
│   ├── controllers/           # API Logic (foodController, userController)
│   ├── middleware/            # Custom filters (rateLimiter, errorHandler, logger)
│   ├── models/                # Mongoose Database Schemas
│   ├── routes/                # Express Route declarations
│   ├── services/              # External services logic (etaService)
│   ├── server.js              # Entrypoint
│   └── package.json           # Server dependencies
├── README.md                  # Project Documentation
└── How To Run Project.pdf     # Quick run guide
```

## Getting Started (Local Development)



1. Check out the respective directories (`frontend`, `admin`, `backend`).
2. Run `npm install` inside each to install its particular dependencies.
3. In `backend`, ensure your `.env` lists your MongoDB URI, Redis Config, Stripe/Razorpay keys, and JWT secrets.
4. Run standard local servers using `npm run dev` in UI directories, and `npm run server` starting `backend`.
