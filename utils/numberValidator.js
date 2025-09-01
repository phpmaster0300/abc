// WhatsApp Number Validator Utility
// Handles Pakistani mobile number validation and formatting

class NumberValidator {
    constructor() {
        // Pakistani mobile network codes
        this.pakistaniNetworks = {
            // Jazz/Warid
            '300': 'Jazz',
            '301': 'Jazz', 
            '302': 'Jazz',
            '303': 'Jazz',
            '304': 'Jazz',
            '305': 'Jazz',
            '306': 'Jazz',
            '307': 'Jazz',
            '308': 'Jazz',
            '309': 'Jazz',
            
            // Telenor
            '340': 'Telenor',
            '341': 'Telenor',
            '342': 'Telenor',
            '343': 'Telenor',
            '344': 'Telenor',
            '345': 'Telenor',
            '346': 'Telenor',
            '347': 'Telenor',
            '348': 'Telenor',
            '349': 'Telenor',
            
            // Zong
            '310': 'Zong',
            '311': 'Zong',
            '312': 'Zong',
            '313': 'Zong',
            '314': 'Zong',
            '315': 'Zong',
            '316': 'Zong',
            '317': 'Zong',
            '318': 'Zong',
            '319': 'Zong',
            
            // Ufone
            '320': 'Ufone',
            '321': 'Ufone',
            '322': 'Ufone',
            '323': 'Ufone',
            '324': 'Ufone',
            '325': 'Ufone',
            '326': 'Ufone',
            '327': 'Ufone',
            '328': 'Ufone',
            '329': 'Ufone',
            
            // SCOM/SCO
            '355': 'SCOM',
            
            // NTC (Special)
            '354': 'NTC'
        };
    }

    /**
     * Validates and formats a Pakistani mobile number
     * @param {string} number - Input number in any format
     * @returns {Object} - Validation result with formatted number
     */
    validateNumber(number) {
        try {
            // Clean the input
            const cleaned = this.cleanNumber(number);
            
            if (!cleaned) {
                return {
                    isValid: false,
                    originalNumber: number,
                    formattedNumber: null,
                    error: 'Empty or invalid number',
                    network: null
                };
            }

            // Try international number validation first
            const internationalValidation = this.validateInternationalNumber(cleaned);
            if (internationalValidation.isValid) {
                return internationalValidation;
            }

            // Try Pakistani number formatting as fallback
            const formatted = this.formatNumber(cleaned);
            
            if (!formatted) {
                return {
                    isValid: false,
                    originalNumber: number,
                    formattedNumber: null,
                    error: 'Invalid number format',
                    network: null
                };
            }

            // Validate the formatted number
            const validation = this.validatePakistaniNumber(formatted);
            
            return {
                isValid: validation.isValid,
                originalNumber: number,
                formattedNumber: validation.isValid ? formatted : null,
                error: validation.error,
                network: validation.network
            };
            
        } catch (error) {
            return {
                isValid: false,
                originalNumber: number,
                formattedNumber: null,
                error: 'Validation error: ' + error.message,
                network: null
            };
        }
    }

    /**
     * Validates international numbers (any country)
     * @param {string} cleaned - Cleaned number string
     * @returns {Object} - Validation result
     */
    validateInternationalNumber(cleaned) {
        // Basic international number validation
        // Accept numbers with 7-15 digits (international standard)
        if (cleaned.length < 7 || cleaned.length > 15) {
            return {
                isValid: false,
                originalNumber: cleaned,
                formattedNumber: null,
                error: 'Invalid international number length',
                network: 'International'
            };
        }

        let formattedNumber = cleaned;
        
        // If number doesn't start with +, add it
        if (!cleaned.startsWith('+')) {
            // If number starts with 00, replace with +
            if (cleaned.startsWith('00')) {
                formattedNumber = '+' + cleaned.substring(2);
            }
            // If number has 10+ digits and doesn't start with 0, assume it has country code
            else if (cleaned.length >= 10 && !cleaned.startsWith('0')) {
                formattedNumber = '+' + cleaned;
            }
            // If number starts with 0 and has 10+ digits, it might be local format
            else if (cleaned.startsWith('0') && cleaned.length >= 10) {
                // Try to detect country code patterns
                if (cleaned.length === 11 && cleaned.startsWith('03')) {
                    // Pakistani format
                    formattedNumber = '+92' + cleaned.substring(1);
                } else {
                    // Generic international format
                    formattedNumber = '+' + cleaned;
                }
            }
            else {
                formattedNumber = '+' + cleaned;
            }
        }

        // Basic validation - must have + and digits
        if (!/^\+\d{7,14}$/.test(formattedNumber)) {
            return {
                isValid: false,
                originalNumber: cleaned,
                formattedNumber: null,
                error: 'Invalid international number format',
                network: 'International'
            };
        }

        return {
            isValid: true,
            originalNumber: cleaned,
            formattedNumber: formattedNumber,
            error: null,
            network: 'International'
        };
    }

    /**
     * Cleans the input number by removing non-digit characters
     * @param {string} number - Input number
     * @returns {string} - Cleaned number with only digits
     */
    cleanNumber(number) {
        if (!number || typeof number !== 'string') {
            return '';
        }
        
        // Remove all non-digit characters except + at the beginning
        let cleaned = number.trim();
        
        // Handle + prefix
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }
        
        // Remove all non-digits
        cleaned = cleaned.replace(/\D/g, '');
        
        return cleaned;
    }

    /**
     * Formats a cleaned number to Pakistani mobile format
     * @param {string} cleaned - Cleaned number with only digits
     * @returns {string|null} - Formatted number or null if invalid
     */
    formatNumber(cleaned) {
        if (!cleaned || cleaned.length < 7) {
            return null;
        }

        // If already starts with +, return as is (international format)
        if (cleaned.startsWith('+')) {
            return cleaned;
        }

        // Case 1: Number starts with 92 (Pakistani country code)
        if (cleaned.startsWith('92') && cleaned.length === 12) {
            return '+' + cleaned;
        }
        
        // Case 2: Number starts with 0 (Pakistani local format)
        if (cleaned.startsWith('0') && cleaned.length === 11) {
            return '+92' + cleaned.substring(1);
        }
        
        // Case 3: Number starts with 3 (Pakistani without 0 prefix)
        if (cleaned.startsWith('3') && cleaned.length === 10) {
            return '+92' + cleaned;
        }
        
        // Case 4: Pakistani number without country code or 0 prefix but starts with network code
        if (cleaned.length === 10 && this.isValidNetworkCode(cleaned.substring(0, 3))) {
            return '+92' + cleaned;
        }
        
        // Case 5: Try to extract Pakistani pattern from longer numbers
        if (cleaned.length > 12) {
            // Look for Pakistani pattern in the number
            const match = cleaned.match(/92(3\d{8})|0?(3\d{8})/);
            if (match) {
                const mobileDigits = match[1] || match[2];
                return '+92' + mobileDigits;
            }
        }

        // Case 6: International numbers (7-15 digits)
        if (cleaned.length >= 7 && cleaned.length <= 15) {
            // If starts with 00, replace with +
            if (cleaned.startsWith('00')) {
                return '+' + cleaned.substring(2);
            }
            // If doesn't start with 0 and has 10+ digits, assume it has country code
            else if (cleaned.length >= 10 && !cleaned.startsWith('0')) {
                return '+' + cleaned;
            }
            // Generic international format
            else {
                return '+' + cleaned;
            }
        }
        
        return null;
    }

    /**
     * Validates if the network code is valid for Pakistani mobile numbers
     * @param {string} networkCode - 3-digit network code
     * @returns {boolean} - True if valid network code
     */
    isValidNetworkCode(networkCode) {
        return this.pakistaniNetworks.hasOwnProperty(networkCode);
    }

    /**
     * Validates a formatted Pakistani mobile number
     * @param {string} formattedNumber - Number in +92xxxxxxxxxx format
     * @returns {Object} - Validation result
     */
    validatePakistaniNumber(formattedNumber) {
        // Check format: +92xxxxxxxxxx (should be 13 characters total)
        if (!formattedNumber || !formattedNumber.startsWith('+92')) {
            return {
                isValid: false,
                error: 'Number must start with +92',
                network: null
            };
        }
        
        // Remove +92 and check remaining digits
        const remainingDigits = formattedNumber.substring(3);
        
        // Should have exactly 10 digits after +92
        if (remainingDigits.length !== 10) {
            return {
                isValid: false,
                error: `Invalid length. Expected 10 digits after +92, got ${remainingDigits.length}`,
                network: null
            };
        }
        
        // Check if all remaining characters are digits
        if (!/^\d{10}$/.test(remainingDigits)) {
            return {
                isValid: false,
                error: 'Number must contain only digits after +92',
                network: null
            };
        }
        
        // First digit should be 3 for mobile numbers
        if (!remainingDigits.startsWith('3')) {
            return {
                isValid: false,
                error: 'Pakistani mobile numbers must start with 3 after country code',
                network: null
            };
        }
        
        const networkCode = remainingDigits.substring(0, 3); // 3xx
        
        // Check if network code is valid
        if (!this.isValidNetworkCode(networkCode)) {
            return {
                isValid: false,
                error: `Invalid network code: ${networkCode}. Supported codes: ${Object.keys(this.pakistaniNetworks).join(', ')}`,
                network: null
            };
        }
        
        return {
            isValid: true,
            error: null,
            network: this.pakistaniNetworks[networkCode]
        };
    }

    /**
     * Batch validate multiple numbers
     * @param {Array<string>} numbers - Array of numbers to validate
     * @returns {Array<Object>} - Array of validation results
     */
    validateNumbers(numbers) {
        if (!Array.isArray(numbers)) {
            throw new Error('Input must be an array of numbers');
        }
        
        return numbers.map(number => this.validateNumber(number));
    }

    /**
     * Get network information for a valid number
     * @param {string} formattedNumber - Formatted number (+92xxxxxxxxxx)
     * @returns {Object|null} - Network information or null
     */
    getNetworkInfo(formattedNumber) {
        const validation = this.validatePakistaniNumber(formattedNumber);
        
        if (!validation.isValid) {
            return null;
        }
        
        const networkCode = formattedNumber.substring(3, 6); // Extract 3xx from +92
        
        return {
            code: networkCode,
            name: this.pakistaniNetworks[networkCode],
            fullNumber: formattedNumber
        };
    }

    /**
     * Format number for WhatsApp (without + prefix)
     * @param {string} formattedNumber - Number in +92xxxxxxxxxx format
     * @returns {string} - Number without + for WhatsApp API
     */
    formatForWhatsApp(formattedNumber) {
        if (formattedNumber && formattedNumber.startsWith('+')) {
            return formattedNumber.substring(1);
        }
        return formattedNumber;
    }

    /**
     * Get all supported network codes
     * @returns {Array<string>} - Array of network codes
     */
    getSupportedNetworks() {
        return Object.keys(this.pakistaniNetworks);
    }

    /**
     * Check if a number is likely a Pakistani mobile number
     * @param {string} number - Input number
     * @returns {boolean} - True if likely Pakistani mobile
     */
    isPakistaniMobile(number) {
        const cleaned = this.cleanNumber(number);
        
        // Quick checks for Pakistani patterns
        if (cleaned.startsWith('92') && cleaned.length >= 12) {
            return true;
        }
        
        if (cleaned.startsWith('03') && cleaned.length >= 11) {
            return true;
        }
        
        if (cleaned.startsWith('3') && cleaned.length >= 10) {
            const networkCode = cleaned.substring(0, 3);
            return this.isValidNetworkCode(networkCode);
        }
        
        return false;
    }
}

module.exports = NumberValidator;