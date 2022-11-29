const express = require('express');
const cors = require('cors');
const jwt=require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")('sk_test_51M7OTXIWBWJssxY4whLOsD74jSprHBFgefBj6BmNZZh8nB5s1G2VhwUzLkbUuoEjoXPYdGKqA5BqRpNKBaeGdPO800UUjbvWcA')
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());



const uri = "mongodb+srv://appointment:dcWjF9U3oaVORGck@cluster0.oyqsogu.mongodb.net/?retryWrites=true&w=majority";



const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionCollection = client.db('appointment').collection('slots');
        const bookingsCollection = client.db('appointment').collection('bookings');
        const usersCollection = client.db('appointment').collection('users');
        const doctorsCollection = client.db('appointment').collection('doctors');
        const paymentsCollection  = client.db('appointment').collection('payments');
        


        // Use Aggregate to query multiple collection and then merge data
        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            // get the bookings of the provided date
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            // code carefully :D
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
            })
            res.send(options);
        });

        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        })

        // get one item form db get by name 
        app.get('/appointmentSpecialty', async(req,res)=>{
            const query={}
            const result=await appointmentOptionCollection.find(query).project({name:1}).toArray()
            res.send(result)
        })

        /***
         * API Naming Convention 
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
        */
       //get user data in emaill
       app.get('/bookings',async(req,res)=>{
        const email=req.query.email;
        const query={email:email}
        const bookings=await bookingsCollection.find(query).toArray()
        res.send(bookings)
       })
       //send booking all data in db

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment 
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({acknowledged: false, message})
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })

        // get one user add data payment 
        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        })
        /// save user data in db:
        app.post('/users',async(req,res)=>{
            const user=req.body;
            const result=await usersCollection.insertOne(user)
            res.send(result)

        })
        /// get jwt 
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, '1136944daf149cae06a067cf01d5022701b20d765fcf3c9a04c7886fb292245cb93132f603baa9bd5f6ca5b4bc44f8275a1912af580a1d926024d3695e2c3d3c',{ expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });
       // get all users from db
       app.get('/users',async(req,res)=>{
        const query={}
        const users=await usersCollection.find(query).toArray()
        res.send(users)
        
       })

       // chake amind bu amind role

       app.get('/users/admin:email',async (req,res)=>{
        const email =req.params.email;
        const query={_id:ObjectId(id)}
        const user=await usersCollection.findOne(query)
        res.send({isAmid:user?.role==='admin'})
       })


       // update any data in db
    //    app.get('/addPrice', async (req, res) => {
    //        const filter = {}
    //         const options = { upsert: true }
    //         const updatedDoc = {
    //             $set: {
    //                  price: 99
    //              }
    //          }
    //          const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
    //          res.send(result);
    //      })

       // create admin in put methoder
       app.put('/users/admin:id', async (req,res)=>{
        const id=req.params.id;
        const filter={_id:ObjectId(id)}
        const option={upsert:true}
        const updateDoc={
            $set:{
                role:'admin'
            }
            
        }
        const result=await usersCollection.updateOne(filter,updateDoc,option)
        res.send(result)

       })

       // cterte doctore in db
       app.post('/doctors', async (req, res) => {
        const doctor = req.body;
        const result = await doctorsCollection.insertOne(doctor);
        res.send(result);
    });
    // send doctor in clint side
    app.get('/doctors', async (req, res) => {
        const query = {};
        const doctors = await doctorsCollection.find(query).toArray();
        res.send(doctors);
    })
    // delete doctor
    app.delete('/doctors/:id',  async (req, res) => {
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const result = await doctorsCollection.deleteOne(filter);
        res.send(result);
    })

    ///payment

    app.post('/create-payment-intent', async (req, res) => {
        const booking = req.body;
        const price = booking.price;
        const amount = price * 100;

        const paymentIntent = await stripe.paymentIntents.create({
            currency: 'usd',
            amount: amount,
            "payment_method_types": [
                "card"
            ]
        });
        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    });

    app.post('/payments', async (req, res) =>{
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        const id = payment.bookingId
        const filter = {_id: ObjectId(id)}
        const updatedDoc = {
            $set: {
                paid: true,
                transactionId: payment.transactionId
            }
        }
        const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
        res.send(result);
    })
      

    }
    finally {

    }
}
run().catch(console.log);

app.get('/', async (req, res) => {
    res.send('doctors portal server is running');
})

app.listen(port, () => console.log(`Doctors portal running on ${port}`))