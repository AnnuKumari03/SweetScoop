-- Online Bakery & Ice Cream Ordering System


CREATE DATABASE IF NOT EXISTS bakery_system;
USE bakery_system;


-- 1. CUSTOMER (Strong Entity)

CREATE TABLE CUSTOMER (
    customer_id     INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    phone           VARCHAR(15)  NOT NULL,
    password        VARCHAR(255) NOT NULL   -- store hashed password only
);


-- 2. CATEGORY (Strong Entity)

CREATE TABLE CATEGORY (
    category_id     INT AUTO_INCREMENT PRIMARY KEY,
    category_name   VARCHAR(50) NOT NULL   -- Ice Cream / Cake / Pastry
);


-- 3. PRODUCT (Strong Entity)  -- belongs to CATEGORY (M:1)

CREATE TABLE PRODUCT (
    product_id      INT AUTO_INCREMENT PRIMARY KEY,
    category_id     INT NOT NULL,
    product_name    VARCHAR(150) NOT NULL,
    price           DECIMAL(10,2) NOT NULL,
    description     TEXT,
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES CATEGORY(category_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);


-- 4. ADDRESS (Weak Entity, owner: CUSTOMER, identifying "has")
--    Composite key: (customer_id, address_id)

CREATE TABLE ADDRESS (
    customer_id     INT NOT NULL,
    address_id      INT NOT NULL,          -- partial key, unique per customer
    street          VARCHAR(200),
    city            VARCHAR(100),
    state           VARCHAR(100),
    pincode         VARCHAR(10),
    PRIMARY KEY (customer_id, address_id),
    CONSTRAINT fk_address_customer
        FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 
-- 5. CART_ITEM (Weak Entity, owner: CUSTOMER, identifying "adds")
--    Composite key: (customer_id, cart_item_id)
 
CREATE TABLE CART_ITEM (
    customer_id     INT NOT NULL,
    cart_item_id    INT NOT NULL,          -- partial key
    product_id      INT NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    PRIMARY KEY (customer_id, cart_item_id),
    CONSTRAINT fk_cartitem_customer
        FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cartitem_product
        FOREIGN KEY (product_id) REFERENCES PRODUCT(product_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 6. ORDERS (Strong Entity) -- places (CUSTOMER 1:M), shipped to (ADDRESS M:1)
--    Note: address_id here references the composite ADDRESS key, so
--    customer_id is included to keep the FK valid.

CREATE TABLE ORDERS (
    order_id        INT AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT NOT NULL,
    address_id      INT NOT NULL,
    order_date      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount    DECIMAL(10,2) NOT NULL,
    order_status    VARCHAR(30) NOT NULL DEFAULT 'Placed', -- Placed/Confirmed/Cancelled etc.
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_orders_address
        FOREIGN KEY (customer_id, address_id) REFERENCES ADDRESS(customer_id, address_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 7. ORDER_ITEM (Weak Entity, owner: ORDERS, identifying "contains")
--    Composite key: (order_id, order_item_id)
 
CREATE TABLE ORDER_ITEM (
    order_id        INT NOT NULL,
    order_item_id   INT NOT NULL,          -- partial key
    product_id      INT NOT NULL,
    quantity        INT NOT NULL,
    price           DECIMAL(10,2) NOT NULL, -- price at time of order
    PRIMARY KEY (order_id, order_item_id),
    CONSTRAINT fk_orderitem_order
        FOREIGN KEY (order_id) REFERENCES ORDERS(order_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_orderitem_product
        FOREIGN KEY (product_id) REFERENCES PRODUCT(product_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);


-- 8. PAYMENT (Strong Entity, 1:1 with ORDERS)

CREATE TABLE PAYMENT (
    payment_id      INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL UNIQUE,   -- UNIQUE enforces the 1:1 relationship
    payment_mode    VARCHAR(20) NOT NULL,  -- UPI / COD
    payment_status  VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending/Success/Failed
    amount          DECIMAL(10,2) NOT NULL,
    payment_date    DATETIME,
    CONSTRAINT fk_payment_order
        FOREIGN KEY (order_id) REFERENCES ORDERS(order_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);


-- 9. DELIVERY (Weak Entity, owner: ORDERS, identifying "has", also 1:1)
--    Composite key: (order_id, delivery_id)
 

CREATE TABLE DELIVERY (
    order_id        INT NOT NULL UNIQUE,   -- UNIQUE enforces the 1:1 relationship
    delivery_id     INT NOT NULL,          -- partial key
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'Packed', -- Packed/Out for delivery/Delivered
    delivery_date   DATETIME,
    PRIMARY KEY (order_id, delivery_id),
    CONSTRAINT fk_delivery_order
        FOREIGN KEY (order_id) REFERENCES ORDERS(order_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);


-- 10. REVIEW (Weak Entity, owner: CUSTOMER, identifying "writes")
--     Composite key: (customer_id, review_id)

CREATE TABLE REVIEW (
    customer_id     INT NOT NULL,
    review_id       INT NOT NULL,          -- partial key
    product_id      INT NOT NULL,
    rating          TINYINT CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    review_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, review_id),
    CONSTRAINT fk_review_customer
        FOREIGN KEY (customer_id) REFERENCES CUSTOMER(customer_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_review_product
        FOREIGN KEY (product_id) REFERENCES PRODUCT(product_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Helpful indexes (beyond PK/FK auto-indexes)

CREATE INDEX idx_product_category ON PRODUCT(category_id);
CREATE INDEX idx_orders_customer  ON ORDERS(customer_id);
CREATE INDEX idx_orderitem_product ON ORDER_ITEM(product_id);
CREATE INDEX idx_review_product   ON REVIEW(product_id);


-- Sample seed data (optional — remove if not needed)

INSERT INTO CATEGORY (category_name) VALUES ('Ice Cream'), ('Cake'), ('Pastry');

INSERT INTO PRODUCT (category_id, product_name, price, description) VALUES
(1, 'Vanilla Ice Cream Tub', 199.00, '500ml classic vanilla'),
(2, 'Chocolate Truffle Cake', 649.00, '1kg chocolate truffle cake'),
(3, 'Butter Croissant', 79.00, 'Freshly baked butter croissant');

INSERT INTO CUSTOMER (name, email, phone, password) VALUES
('Aarav Shah', 'aarav@example.com', '9998887771', 'hashed_password_here');

INSERT INTO ADDRESS (customer_id, address_id, street, city, state, pincode) VALUES
(1, 1, '12 MG Road', 'Gandhinagar', 'Gujarat', '382007');
