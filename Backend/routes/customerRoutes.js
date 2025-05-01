const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middlewares/verifyToken');

// ✅ Get available rooms
router.get('/rooms', verifyToken, (req, res) => {
  const query = 'SELECT * FROM rooms WHERE availability = true';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: 'Error fetching rooms' });

    res.json({ rooms: results });
  });
});

// ✅ Book a room
router.post('/book', verifyToken, (req, res) => {
  const { roomId } = req.body;
  const customerId = req.userId;
  const checkIn = new Date().toISOString().split('T')[0]; // Current date
  const checkOut = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]; // Next day

  // Start transaction to ensure both updates succeed or fail
  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ message: 'Transaction error', error: err.message });

    const bookingQuery = 'INSERT INTO bookings (customer_id, room_id, check_in, check_out) VALUES (?, ?, ?, ?)';
    db.query(bookingQuery, [customerId, roomId, checkIn, checkOut], (err, result) => {
      if (err) {
        return db.rollback(() => {
          console.error('Error inserting booking:', err);
          res.status(500).json({ message: 'Error booking room', error: err.message });
        });
      }

      const updateRoomQuery = 'UPDATE rooms SET availability = false WHERE id = ?';
      db.query(updateRoomQuery, [roomId], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error('Error updating room availability:', err);
            res.status(500).json({ message: 'Error updating room availability', error: err.message });
          });
        }

        db.commit((err) => {
          if (err) {
            return db.rollback(() => {
              console.error('Commit error:', err);
              res.status(500).json({ message: 'Error committing transaction', error: err.message });
            });
          }
          console.log('Room booked successfully, booking ID:', result.insertId);
          res.status(201).json({ message: 'Room booked successfully', bookingId: result.insertId });
        });
      });
    });
  });
});

module.exports = router;