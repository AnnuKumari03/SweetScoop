# Sweet Scoop — Project Brief

Course: CS543 Web Services  
Assignment: 1 — HTTP by Hand & Project Setup  
Team ID: 10.
Team Leader :Annu Kumari (20251651024).
Team members: Prerna (20251651072); Akanksha Upadhyay (20251651011); 

## What it does

Sweet Scoop is an online ordering platform for handcrafted ice cream, cakes, and sundaes. Customers browse products, manage account and delivery details, place and pay for orders, and track delivery. Staff-facing service APIs maintain the catalogue, stock, payments, deliveries, and reviews.

## Who uses it

- Customers browsing products, managing their profile, ordering, and tracking deliveries.
- Store operators maintaining products and stock and fulfilling orders.
- Payment and delivery partners exchanging payment or shipment information.
- Developers integrating with the REST, GraphQL, and SOAP contracts.

## Nouns — resources and services

Product, Category, Inventory, Customer, Address, Order, Order Item, Coupon, Payment, Refund, Delivery, Shipment, Tracking Event, Review, Catalogue Service, Customer Service, Order Service, Payment Service, Delivery Service, and Reviews Service.

## Verbs — actions and contracts

List, search, and retrieve products; create, update, and delete catalogue items; adjust inventory; register and authenticate customers; retrieve and update profiles; list and add addresses; place, retrieve, list, and cancel orders; process and refund payments; create and track deliveries; update delivery status; post and list reviews; query review averages; query the anonymized top-buyer list.

The services expose versioned REST resources under `/v1`, a GraphQL endpoint for catalogue queries, and a SOAP delivery-partner contract. Service ownership and operation contracts are detailed in [Assignment 2](../Assignment%202/design.md).
