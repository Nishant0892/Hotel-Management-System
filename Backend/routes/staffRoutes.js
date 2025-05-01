const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middlewares/verifyToken');

// Get staff dashboard data
router.get('/dashboard', verifyToken, (req, res) => {
  console.log('Fetching dashboard data');
  const staffQuery = `
    SELECT u.id, u.name AS staff_name, u.email, s.amount AS salary
    FROM users u
    LEFT JOIN staff_salaries s ON u.id = s.staff_id
    WHERE u.role = 'staff'
  `;
  const bookingsQuery = `
    SELECT b.id, r.room_number, u.name AS customer_name, b.check_in, b.check_out
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN users u ON b.customer_id = u.id
  `;
  const roomsQuery = "SELECT id, room_number, type, availability FROM rooms";
  const totalRoomsQuery = "SELECT COUNT(*) AS total_rooms FROM rooms";

  db.query(staffQuery, (err, staffResults) => {
    if (err) {
      console.error('Error fetching staff:', err);
      return res.status(500).json({ message: 'Error fetching staff data', error: err.message });
    }

    db.query(bookingsQuery, (err, bookingsResults) => {
      if (err) {
        console.error('Error fetching bookings:', err);
        return res.status(500).json({ message: 'Error fetching bookings', error: err.message });
      }
      console.log('Raw bookings data:', bookingsResults); // Log raw data for debugging

      db.query(roomsQuery, (err, roomsResults) => {
        if (err) {
          console.error('Error fetching rooms:', err);
          return res.status(500).json({ message: 'Error fetching rooms', error: err.message });
        }

        db.query(totalRoomsQuery, (err, totalRoomsResult) => {
          if (err) {
            console.error('Error fetching total rooms:', err);
            return res.status(500).json({ message: 'Error fetching total rooms', error: err.message });
          }

          console.log('Dashboard data fetched:', {
            staffCount: staffResults.length,
            bookingsCount: bookingsResults.length,
            roomsCount: roomsResults.length,
            totalRooms: totalRoomsResult[0].total_rooms
          });

          return res.status(200).json({
            staff: staffResults,
            bookings: bookingsResults,
            rooms: roomsResults,
            totalRooms: totalRoomsResult[0].total_rooms
          });
        });
      });
    });
  });
});

// Update staff name and email
router.put('/staff/:id', verifyToken, (req, res) => {
  console.log(`Updating staff ID: ${req.params.id}`);
  const { id } = req.params;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  const query = 'UPDATE users SET name = ?, email = ? WHERE id = ? AND role = "staff"';
  db.query(query, [name, email, id], (err, result) => {
    if (err) {
      console.error('Error updating staff:', err);
      return res.status(500).json({ message: 'Error updating staff', error: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Staff not found or not a staff member' });
    }
    res.status(200).json({ message: 'Staff updated successfully' });
  });
});

// Delete staff
router.delete('/staff/:id', verifyToken, (req, res) => {
  console.log(`Deleting staff ID: ${req.params.id}`);
  const { id } = req.params;

  const query = 'DELETE FROM users WHERE id = ? AND role = "staff"';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error deleting staff:', err);
      return res.status(500).json({ message: 'Error deleting staff', error: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Staff not found or not a staff member' });
    }
    res.status(200).json({ message: 'Staff deleted successfully' });
  });
});

// Cancel booking (update room availability)
router.patch('/bookings/:id/cancel', verifyToken, (req, res) => {
  console.log(`Cancelling booking ID: ${req.params.id}`);
  const { id } = req.params;

  // Get room_id from booking
  const getRoomQuery = 'SELECT room_id FROM bookings WHERE id = ?';
  db.query(getRoomQuery, [id], (err, result) => {
    if (err) {
      console.error('Error fetching booking:', err);
      return res.status(500).json({ message: 'Error fetching booking', error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const roomId = result[0].room_id;

    // Update room availability to TRUE
    const updateRoomQuery = 'UPDATE rooms SET availability = TRUE WHERE id = ?';
    db.query(updateRoomQuery, [roomId], (err) => {
      if (err) {
        console.error('Error updating room availability:', err);
        return res.status(500).json({ message: 'Error updating room availability', error: err.message });
      }

      // Delete the booking
      const deleteBookingQuery = 'DELETE FROM bookings WHERE id = ?';
      db.query(deleteBookingQuery, [id], (err) => {
        if (err) {
          console.error('Error deleting booking:', err);
          return res.status(500).json({ message: 'Error deleting booking', error: err.message });
        }
        res.status(200).json({ message: 'Booking cancelled and room made available' });
      });
    });
  });
});

// Add new room
router.post('/rooms', verifyToken, (req, res) => {
  console.log('Attempting to add room:', req.body);
  const { room_number, type } = req.body;

  if (!room_number?.trim() || !type?.trim()) {
    console.log('Missing or empty room_number or type');
    return res.status(400).json({ message: 'Room number and type are required and cannot be empty' });
  }

  if (!/^[a-zA-Z0-9-]+$/.test(room_number)) {
    console.log(`Invalid room_number format: ${room_number}`);
    return res.status(400).json({ message: 'Room number can only contain letters, numbers, or hyphens' });
  }

  const checkRoomQuery = 'SELECT id FROM rooms WHERE room_number = ?';
  db.query(checkRoomQuery, [room_number], (err, results) => {
    if (err) {
      console.error('Error checking room number:', err);
      return res.status(500).json({ message: 'Error checking room number', error: err.message });
    }
    if (results.length > 0) {
      console.log(`Room number ${room_number} already exists`);
      return res.status(400).json({ message: 'Room number already exists' });
    }

    const query = 'INSERT INTO rooms (room_number, type, availability) VALUES (?, ?, TRUE)';
    db.query(query, [room_number, type], (err, result) => {
      if (err) {
        console.error('Error adding room:', err);
        return res.status(500).json({ message: 'Error adding room', error: err.message });
      }
      console.log(`Room added with ID: ${result.insertId}`);
      res.status(201).json({ message: 'Room added successfully', id: result.insertId });
    });
  });
});

module.exports = router;