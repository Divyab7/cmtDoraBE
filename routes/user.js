const express = require('express');
const router = express.Router();
const { UserModel } = require('../models/User');

// Helper function to parse DD-MM-YYYY to Date object
function parseDateString(dateString) {
    if (!dateString) return null;
    
    // Validate date format
    if (!/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
        throw new Error('Invalid date format. Use DD-MM-YYYY');
    }
    
    const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));
    
    // Validate month and day ranges
    if (month < 1 || month > 12) throw new Error('Invalid month');
    if (day < 1 || day > 31) throw new Error('Invalid day');
    
    const date = new Date(year, month - 1, day);
    
    // Validate if it's a valid date (handles cases like 31st Feb)
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        throw new Error('Invalid date');
    }
    
    // Validate if date is not in future
    if (date > new Date()) {
        throw new Error('Date of birth cannot be in the future');
    }
    
    return date;
}

// Helper function to format Date to DD-MM-YYYY
function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null; // Handle invalid date
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// List all known contacts with name and age
router.get('/contacts', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const contacts = user.knownContacts.map(contact => ({
            id: contact._id,
            name: contact.name,
            age: contact.dateOfBirth ? calculateAge(contact.dateOfBirth) : null,
            dateOfBirth: contact.dateOfBirth ? formatDate(contact.dateOfBirth) : null
        }));

        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching contacts', error: error.message });
    }
});

// Get details of a specific contact
router.get('/contacts/:contactId', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const contact = user.knownContacts.id(req.params.contactId);
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        const formattedContact = {
            ...contact.toObject(),
            dateOfBirth: contact.dateOfBirth ? formatDate(contact.dateOfBirth) : null
        };

        res.json(formattedContact);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching contact details', error: error.message });
    }
});

// Create new contact
router.post('/contacts', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let dateOfBirth = null;
        try {
            if (req.body.dateOfBirth) {
                dateOfBirth = parseDateString(req.body.dateOfBirth);
            }
        } catch (dateError) {
            return res.status(400).json({ message: 'Invalid date of birth', error: dateError.message });
        }

        const contactData = {
            ...req.body,
            dateOfBirth
        };

        user.knownContacts.push(contactData);
        
        try {
            await user.save();
        } catch (validationError) {
            return res.status(400).json({ 
                message: 'Validation error', 
                error: validationError.message 
            });
        }

        const newContact = user.knownContacts[user.knownContacts.length - 1];
        const formattedContact = {
            ...newContact.toObject(),
            dateOfBirth: newContact.dateOfBirth ? formatDate(newContact.dateOfBirth) : null
        };

        res.status(201).json(formattedContact);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Error creating contact', error: error.message });
    }
});

// Update contact
router.put('/contacts/:contactId', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const contact = user.knownContacts.id(req.params.contactId);
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        let dateOfBirth = contact.dateOfBirth;
        try {
            if (req.body.dateOfBirth !== undefined) {
                dateOfBirth = req.body.dateOfBirth ? parseDateString(req.body.dateOfBirth) : null;
            }
        } catch (dateError) {
            return res.status(400).json({ message: 'Invalid date of birth', error: dateError.message });
        }

        const updateData = {
            ...req.body,
            dateOfBirth
        };

        Object.assign(contact, updateData);
        
        try {
            await user.save();
        } catch (validationError) {
            return res.status(400).json({ 
                message: 'Validation error', 
                error: validationError.message 
            });
        }

        const formattedContact = {
            ...contact.toObject(),
            dateOfBirth: contact.dateOfBirth ? formatDate(contact.dateOfBirth) : null
        };

        res.json(formattedContact);
    } catch (error) {
        res.status(500).json({ message: 'Error updating contact', error: error.message });
    }
});

// Delete contact
router.delete('/contacts/:contactId', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const contact = user.knownContacts.id(req.params.contactId);
        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        contact.remove();
        await user.save();

        res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting contact', error: error.message });
    }
});

// Helper function to calculate age from date of birth
function calculateAge(dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

module.exports = router; 